import { Plugin, TFile, Notice } from "obsidian";
import { registerCommands } from "./commands/index";
import { addFsrsFieldsToCurrentFile as addFsrsFieldsToCurrentFileFunction } from "./commands/add-fsrs-fields";
import {
    reviewCurrentCard,
    reviewCardByPath,
} from "./commands/review/review-card";
import {
    deleteLastReview,
    deleteLastReviewCurrentCard,
} from "./commands/review/delete-last-review";

import { ReviewButtonRenderer } from "./ui/review-button-renderer";
import { FsrsTableRenderer } from "./ui/fsrs-table-renderer";
import { FsrsHeatmapRenderer } from "./ui/fsrs-heatmap-renderer";

import { FsrsPluginSettings, DEFAULT_SETTINGS } from "./settings/types";
import { FsrsSettingTab } from "./settings/settings-core";

import { FsrsCache } from "./utils/fsrs/fsrs-cache";
import type { CacheCardInput } from "./utils/fsrs/fsrs-cache";
import {
    base64ToBytes,
    shouldIgnoreFileWithSettings,
    extractFrontmatter,
    parseCardDataFromFrontmatter,
    computeCardState,
} from "./utils/fsrs";
import type { FSRSRating, ReviewSession, CardData } from "./interfaces/fsrs";
import { i18n } from "./utils/i18n";
import { showNotice } from "./utils/notice";
import { verboseLog, setVerboseLoggingEnabled } from "./utils/logger";

import init from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "../wasm-lib/pkg/wasm_lib_base64";

/** Интерфейс для рендереров, поддерживающих обновление */
interface RefreshableRenderer {
    refresh(): Promise<void>;
}

/**
 * Основной класс плагина FSRS для Obsidian
 * Интегрирует алгоритм интервального повторения FSRS в Obsidian
 */
export default class FsrsPlugin extends Plugin {
    settings: FsrsPluginSettings;
    private isWasmInitialized = false;
    private lastReloadNoticeTime = 0;

    private fsrsTableRenderers = new Set<RefreshableRenderer>();
    // Кэш карточек в WASM
    public cache!: FsrsCache;
    // Промис сканирования хранилища (запускается по первому запросу)
    private scanPromise: Promise<void> | null = null;

    /**
     * Извлекает и нормализует массив ReviewSession из frontmatter объекта metadataCache.
     * Obsidian может хранить даты как строки или как объекты Date.
     */
    private parseReviewsFromCache(rawReviews: unknown[]): ReviewSession[] {
        const reviews: ReviewSession[] = [];
        for (const session of rawReviews) {
            if (!session || typeof session !== "object") continue;
            const s = session as Record<string, unknown>;
            let date: string;
            if (typeof s.date === "string") {
                date = s.date;
            } else if (s.date instanceof Date) {
                date = s.date.toISOString();
            } else {
                continue;
            }
            const rating =
                typeof s.rating === "number" && s.rating >= 0 && s.rating <= 3
                    ? s.rating
                    : undefined;
            if (rating === undefined) continue;
            reviews.push({ date, rating });
        }
        return reviews;
    }
    // Флаг: завершено ли начальное сканирование хранилища
    private initialScanCompleted = false;
    // Ожидающие сканирования карточки
    private pendingScans = new Set<string>();
    // Флаг: запланировано ли уведомление рендереров (чтобы не перерисовывать 1000 раз)
    private notifyRenderersScheduled = false;
    // Колбэки, ожидающие инициализации WASM
    private wasmReadyCallbacks = new Set<() => void>();

    /**
     * Загрузка плагина
     */
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new FsrsSettingTab(this.app, this));

        verboseLog("=== Загрузка FSRS плагина с WASM ===");

        // Регистрация команд плагина
        registerCommands(this);

        // Создание объекта кэша (без инициализации WASM — она в onLayoutReady)
        this.cache = new FsrsCache();

        // Регистрация процессора для кнопки повторения карточки
        this.registerMarkdownCodeBlockProcessor(
            "fsrs-review-button",
            (_source, el, ctx) => {
                // Создаем контейнер для кнопки
                const buttonContainer = createDiv();
                buttonContainer.className = "fsrs-review-button-container";
                el.appendChild(buttonContainer);

                // Получаем стабильную ссылку на файл
                const sourceFile = this.app.vault.getFileByPath(ctx.sourcePath);
                if (!sourceFile) return;

                // Создаем рендерер кнопки
                const renderer = new ReviewButtonRenderer(
                    this,
                    buttonContainer,
                    sourceFile,
                );
                ctx.addChild(renderer);
            },
        );

        // Регистрация MarkdownCodeBlockProcessor для блоков fsrs-table
        this.registerMarkdownCodeBlockProcessor(
            "fsrs-table",
            (source, el, ctx) => {
                // Создаем контейнер для рендеринга
                const renderContainer = createDiv();
                renderContainer.className = "fsrs-table-render-container";
                el.appendChild(renderContainer);

                // Создаем и добавляем рендерер
                const renderer = new FsrsTableRenderer(
                    this,
                    renderContainer,
                    source,
                );
                ctx.addChild(renderer);
            },
        );

        // Регистрация MarkdownCodeBlockProcessor для блоков fsrs-heatmap
        this.registerMarkdownCodeBlockProcessor(
            "fsrs-heatmap",
            (source, el, ctx) => {
                const renderContainer = createDiv();
                renderContainer.className = "fsrs-heatmap-render-container";
                el.appendChild(renderContainer);

                const renderer = new FsrsHeatmapRenderer(
                    this,
                    renderContainer,
                    source,
                );
                ctx.addChild(renderer);
            },
        );

        // Регистрация обработчиков изменений файлов для кэша WASM
        // Проверка isWasmReady защищает от вызовов до инициализации WASM
        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                if (!this.isWasmReady()) return;
                if (!this.initialScanCompleted) return;
                this.cache.removeCard(file.path);
                this.notifyFsrsTableRenderers();
            }),
        );
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                if (!this.isWasmReady()) return;
                if (!this.initialScanCompleted) return;
                this.cache.removeCard(oldPath);
                this.notifyFsrsTableRenderers();
                this.scheduleCardScan(file.path);
            }),
        );
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (!this.isWasmReady()) return;
                if (!this.initialScanCompleted) return;
                if (
                    file.path &&
                    !shouldIgnoreFileWithSettings(
                        file.path,
                        this.settings,
                        this.app.vault.configDir,
                    )
                ) {
                    this.scheduleCardScan(file.path);
                }
            }),
        );

        // Инициализация WASM — после полной загрузки UI,
        // чтобы не блокировать onload() тяжёлыми операциями (base64 → bytes, компиляция WASM).
        // Сканирование хранилища — ленивое, запускается по первому запросу к кэшу.
        this.app.workspace.onLayoutReady(async () => {
            await this.initializeWasm();
            verboseLog(
                "WASM инициализирован, кэш готов. Сканирование — по запросу.",
            );
        });

        verboseLog("FSRS плагин успешно загружен");
    }

    /**
     * Инициализация WASM модуля
     */
    private async initializeWasm(): Promise<void> {
        try {
            verboseLog("1. Конвертируем base64 в байты...");
            const wasmBytes = base64ToBytes(WASM_BASE64);
            verboseLog("2. Длина WASM байтов:", wasmBytes.length);

            verboseLog("3. Вызываем init...");
            await init({ module_or_path: wasmBytes });
            verboseLog("4. WASM инициализирован");

            // Инициализируем кэш сразу после WASM (чтобы isWasmReady подразумевал
            // и готовность кэша)
            this.cache.init();
            verboseLog("5. Кэш инициализирован");

            this.isWasmInitialized = true;

            // Оповещаем всех, кто ждал инициализации WASM
            for (const cb of this.wasmReadyCallbacks) {
                cb();
            }
            this.wasmReadyCallbacks.clear();
        } catch (error) {
            console.error("Ошибка загрузки WASM модуля:", error);
            showNotice("notices.wasm_not_ready");
            this.isWasmInitialized = false;
        }
    }

    /**
     * Сканирование всех markdown-файлов хранилища с отдачей управления event loop.
     * Читает файлы, парсит frontmatter, вычисляет состояния
     * и отправляет в WASM-кэш через addOrUpdateCards.
     *
     * Обрабатывает файлы порциями (CHUNK_SIZE) и между порциями
     * отдаёт управление через setTimeout(0), чтобы не блокировать event loop.
     */
    private async performCacheScanAsync(
        onProgress?: (current: number, total: number) => void,
    ): Promise<void> {
        verboseLog("🔍 Начинаю сканирование хранилища...");
        const start = performance.now();
        const files = this.app.vault.getMarkdownFiles();

        let filteredCount = 0;
        let noFrontmatterCount = 0;
        let skippedCount = 0;

        const CHUNK_SIZE = 500;
        const batch: CacheCardInput[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!file) continue;
            if (
                shouldIgnoreFileWithSettings(
                    file.path,
                    this.settings,
                    this.app.vault.configDir,
                )
            ) {
                filteredCount++;
                continue;
            }
            try {
                // Быстрая проверка frontmatter через metadataCache — без чтения файла
                const fileCache = this.app.metadataCache.getFileCache(file);
                if (!fileCache?.frontmatter) {
                    noFrontmatterCount++;
                    continue;
                }
                // Используем данные reviews из metadataCache — без чтения файла
                const cachedFrontmatter = fileCache.frontmatter as Record<
                    string,
                    unknown
                >;
                if (!cachedFrontmatter.reviews) {
                    skippedCount++;
                    continue;
                }

                const rawReviews = cachedFrontmatter.reviews;
                if (!Array.isArray(rawReviews)) {
                    skippedCount++;
                    continue;
                }

                // Нормализуем даты и рейтинги из кэша Obsidian
                const reviews = this.parseReviewsFromCache(rawReviews);

                if (reviews.length === 0) {
                    skippedCount++;
                    continue;
                }

                const card: CardData = { reviews, filePath: file.path };
                const state = computeCardState(card, this.settings);
                batch.push({
                    filePath: file.path,
                    card,
                    state,
                });
            } catch {
                skippedCount++;
            }

            // Каждые CHUNK_SIZE файлов — отправляем в WASM и отдаём управление event loop
            if (batch.length >= CHUNK_SIZE) {
                const result = this.cache.addOrUpdateCards(batch);
                if (result.errors.length > 0) {
                    verboseLog(
                        `Ошибки при добавлении карточек: ${result.errors.join(", ")}`,
                    );
                }
                batch.length = 0;
                onProgress?.(i + 1, files.length);

                // Отдаём управление, чтобы Obsidian не ругался на долгий setTimeout
                await new Promise<void>((resolve) =>
                    activeWindow.setTimeout(resolve, 0),
                );
            }
        }

        // Отправляем оставшиеся карточки в WASM
        if (batch.length > 0) {
            const result = this.cache.addOrUpdateCards(batch);
            if (result.errors.length > 0) {
                verboseLog(
                    `Ошибки при добавлении карточек: ${result.errors.join(", ")}`,
                );
            }
        }

        // Прогресс: сканирование завершено
        onProgress?.(files.length, files.length);

        const fsrsCount = this.cache.size();
        verboseLog(`🗃️ Всего файлов .md: ${files.length}`);
        verboseLog(`➖ Отфильтровано (игнор-список): ${filteredCount}`);
        verboseLog(`➖ Без frontmatter: ${noFrontmatterCount}`);
        verboseLog(`➖ С frontmatter, без FSRS-полей: ${skippedCount}`);
        verboseLog(`📄 Найдено карточек FSRS: ${fsrsCount}`);
        const elapsed = (performance.now() - start) / 1000;
        verboseLog(`⏱️ Сканирование всего хранилища: ${elapsed.toFixed(2)} с`);
    }

    /**
     * Планирует сканирование одной карточки.
     * При повторном вызове для того же пути игнорируется (уже в очереди).
     */
    private scheduleCardScan(filePath: string): void {
        if (this.pendingScans.has(filePath)) return;
        this.pendingScans.add(filePath);

        queueMicrotask(() => {
            this.pendingScans.delete(filePath);
            void this.scanSingleCard(filePath);
        });
    }

    /**
     * Сканирует одну карточку по пути файла.
     * Читает файл, парсит frontmatter, вычисляет состояние и обновляет кэш.
     * Если карточка не содержит FSRS-данных — удаляет из кэша.
     */
    private async scanSingleCard(filePath: string): Promise<void> {
        if (
            shouldIgnoreFileWithSettings(
                filePath,
                this.settings,
                this.app.vault.configDir,
            )
        ) {
            this.cache.removeCard(filePath);
            this.notifyFsrsTableRenderers();
            return;
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;

            const content = await this.app.vault.read(file);
            const frontmatter = extractFrontmatter(content);
            if (!frontmatter) {
                this.cache.removeCard(filePath);
                this.notifyFsrsTableRenderers();
                return;
            }

            const parseResult = parseCardDataFromFrontmatter(
                frontmatter,
                filePath,
            );
            if (parseResult.success && parseResult.card) {
                const state = computeCardState(parseResult.card, this.settings);
                this.cache.addOrUpdateCards([
                    { filePath, card: parseResult.card, state },
                ]);
                this.notifyFsrsTableRenderers();
            } else {
                this.cache.removeCard(filePath);
                this.notifyFsrsTableRenderers();
            }
        } catch (error) {
            console.warn(
                `Ошибка при сканировании карточки ${filePath}:`,
                error,
            );
            this.cache.removeCard(filePath);
            this.notifyFsrsTableRenderers();
        }
    }

    /**
     * Добавляет поля FSRS в текущий файл
</｜DSML｜parameter>
     * Реализация для команды плагина
     */
    async addFsrsFieldsToCurrentFile(): Promise<void> {
        await addFsrsFieldsToCurrentFileFunction(this.app, this.settings);
        this.notifyFsrsTableRenderers();
    }

    /**
     * Обеспечивает готовность кэша: запускает сканирование хранилища,
     * если оно ещё не было запущено, и ждёт его завершения.
     *
     * Безопасно вызывать многократно — повторный вызов во время сканирования
     * дожидается текущего, а после завершения возвращается мгновенно.
     */
    async ensureCacheScanned(): Promise<void> {
        // Ждём инициализации WASM (если ещё не готова)
        // isWasmReady() подразумевает и готовность кэша после перемещения cache.init()
        if (!this.isWasmReady()) {
            await new Promise<void>((resolve) => this.onWasmReady(resolve));
        }

        if (this.initialScanCompleted) return;
        if (this.scanPromise) {
            await this.scanPromise;
            return;
        }

        try {
            await this.performCacheScanAsync();
        } catch (error) {
            console.error("Ошибка при сканировании хранилища:", error);
        }
        this.initialScanCompleted = true;
        this.scanPromise = null;
    }

    /**
     * Повторяет текущую карточку
     * Реализация для команды плагина
     */
    async reviewCurrentCard(): Promise<void> {
        await reviewCurrentCard(this.app, this);
    }

    /**
     * Повторяет карточку по указанному пути файла
     * Можно вызывать из frontmatter через кнопку
     */
    async reviewCardByPath(filePath: string): Promise<FSRSRating | null> {
        return await reviewCardByPath(this.app, this, filePath);
    }

    /**
     * Удаляет последнее повторение карточки по указанному пути файла
     * Можно вызывать из команды плагина
     */
    async deleteLastReview(filePath: string): Promise<boolean> {
        return await deleteLastReview(this.app, this, filePath);
    }

    /**
     * Удаляет последнее повторение текущей карточки
     * Можно вызывать из команды плагина
     */
    async deleteLastReviewForCurrentFile(): Promise<boolean> {
        return await deleteLastReviewCurrentCard(this.app, this);
    }

    /**
     * Загружает настройки плагина
     */
    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<FsrsPluginSettings>,
        );
        const lang =
            this.settings.language === "system"
                ? i18n.resolveLocale("system")
                : this.settings.language || "en";
        i18n.setLocale(lang);
        setVerboseLoggingEnabled(this.settings.verbose_logging);
    }

    /**
     * Сохраняет настройки плагина
     */
    async saveSettings() {
        setVerboseLoggingEnabled(this.settings.verbose_logging);

        const oldSettings =
            (await this.loadData()) as FsrsPluginSettings | null;

        await this.saveData(this.settings);

        if (oldSettings && fsrsParamsChanged(oldSettings, this.settings)) {
            const now = Date.now();
            if (now - this.lastReloadNoticeTime > 7000) {
                this.lastReloadNoticeTime = now;
                new Notice(i18n.t("notices.settings_changed_reload"));
            }
        }
    }

    /**
     * Проверяет, инициализирован ли WASM модуль
     */
    isWasmReady(): boolean {
        return this.isWasmInitialized;
    }

    /**
     * Регистрирует колбэк, который будет вызван после инициализации WASM.
     * Если WASM уже готов — вызывает сразу.
     */
    onWasmReady(callback: () => void): void {
        if (this.isWasmReady()) {
            callback();
        } else {
            this.wasmReadyCallbacks.add(callback);
        }
    }

    /**
     * Выгрузка плагина
     */
    onunload() {
        verboseLog("Выгрузка FSRS плагина");
        this.isWasmInitialized = false;
        this.fsrsTableRenderers.clear();

        // Сбрасываем флаги ленивого сканирования
        this.scanPromise = null;
        this.initialScanCompleted = false;
        this.notifyRenderersScheduled = false;

        // Очищаем pending сканирования
        this.pendingScans.clear();
    }

    /**
     * Регистрирует активный рендерер fsrs-table для уведомлений об обновлениях.
     * Первый рендер запускается самим рендерером в onload() через refresh().
     */
    registerFsrsTableRenderer(renderer: RefreshableRenderer): void {
        this.fsrsTableRenderers.add(renderer);
    }

    /**
     * Удаляет рендерер из списка активных
     */
    unregisterFsrsTableRenderer(renderer: RefreshableRenderer): void {
        this.fsrsTableRenderers.delete(renderer);
    }

    /**
     * Уведомляет все активные рендереры fsrs-table об обновлении данных.
     * Использует queueMicrotask — при массовых изменениях рендер происходит
     * один раз, а не на каждый чих.
     */
    notifyFsrsTableRenderers(): void {
        if (this.notifyRenderersScheduled) return;
        this.notifyRenderersScheduled = true;
        queueMicrotask(() => {
            this.notifyRenderersScheduled = false;
            for (const renderer of this.fsrsTableRenderers) {
                renderer.refresh().catch((error) => {
                    console.error(
                        "Ошибка при обновлении рендерера fsrs-table:",
                        error,
                    );
                });
            }
        });
    }
}

/**
 * Сравнивает старые и новые настройки FSRS.
 * Возвращает true, если хотя бы один параметр, влияющий на пересчёт состояний, изменился.
 */
function fsrsParamsChanged(
    oldSettings: FsrsPluginSettings,
    newSettings: FsrsPluginSettings,
): boolean {
    return (
        oldSettings.parameters.request_retention !==
            newSettings.parameters.request_retention ||
        oldSettings.parameters.maximum_interval !==
            newSettings.parameters.maximum_interval ||
        oldSettings.parameters.enable_fuzz !==
            newSettings.parameters.enable_fuzz ||
        oldSettings.default_initial_stability !==
            newSettings.default_initial_stability ||
        oldSettings.default_initial_difficulty !==
            newSettings.default_initial_difficulty
    );
}
