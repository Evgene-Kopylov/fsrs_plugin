import { Plugin, TFile, Notice } from "obsidian";
import { registerCommands } from "./commands/index";
import { addFsrsFieldsToCurrentFile as addFsrsFieldsToCurrentFileFunction } from "./commands/add-fsrs-fields";
import { findFsrsCards } from "./commands/find-fsrs-cards";
import {
    reviewCurrentCard,
    reviewCardByPath,
    deleteLastReview,
    deleteLastReviewCurrentCard,
} from "./commands/review";

import { ReviewButtonRenderer } from "./ui/review-button-renderer";
import { FsrsTableRenderer } from "./ui/fsrs-table-renderer";
import { StatusBarManager } from "./ui/status-bar-manager";

import { FsrsPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { FsrsSettingTab } from "./settings";

import { FsrsCache } from "./utils/fsrs/fsrs-cache";
import type { CacheCardInput } from "./utils/fsrs/fsrs-cache";
import {
    base64ToBytes,
    shouldIgnoreFileWithSettings,
    extractFrontmatter,
    parseModernFsrsFromFrontmatter,
    computeCardState,
} from "./utils/fsrs";
import type { FSRSRating, CachedCard } from "./interfaces/fsrs";
import { i18n } from "./utils/i18n";
import { showNotice } from "./utils/notice";
import { verboseLog, setVerboseLoggingEnabled } from "./utils/logger";

// Импорт WASM функций
import init from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "../wasm-lib/pkg/wasm_lib_base64";

/**
 * Основной класс плагина FSRS для Obsidian
 * Интегрирует алгоритм интервального повторения FSRS в Obsidian
 */
export default class FsrsPlugin extends Plugin {
    settings: FsrsPluginSettings;
    private isWasmInitialized = false;
    private lastReloadNoticeTime = 0;

    private fsrsTableRenderers = new Set<FsrsTableRenderer>();
    // Кэш карточек в WASM
    public cache!: FsrsCache;
    // Флаг: завершено ли начальное сканирование хранилища
    private scanCompleted = false;
    // Ожидающие сканирования карточки
    private pendingScans = new Set<string>();
    // Флаг: запланировано ли уведомление рендереров (чтобы не перерисовывать 1000 раз)
    private notifyRenderersScheduled = false;
    public statusBarManager: StatusBarManager | null = null;

    /**
     * Загрузка плагина
     */
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new FsrsSettingTab(this.app, this));

        verboseLog("=== Загрузка FSRS плагина с WASM ===");

        // Инициализация WASM модуля
        await this.initializeWasm();

        // Регистрация команд плагина
        registerCommands(this);

        // Создание менеджера статус-бара
        this.statusBarManager = new StatusBarManager(
            this,
            this.app,
            this.settings,
        );
        this.statusBarManager.init();

        // Инициализация кэша в WASM
        this.cache = new FsrsCache();
        this.cache.init();

        // Запуск прогрессивного сканирования хранилища после полной инициализации
        // onLayoutReady гарантирует, что все файлы хранилища проиндексированы
        this.app.workspace.onLayoutReady(() => {
            this.performCacheScan()
                .then(() => {
                    verboseLog("Сканирование хранилища завершено");
                    this.scanCompleted = true;
                    // Уведомляем все существующие рендереры напрямую (без debounce)
                    for (const renderer of this.fsrsTableRenderers) {
                        renderer.refresh().catch(console.error);
                    }
                })
                .catch((error) => {
                    console.error("Ошибка при сканировании хранилища:", error);
                    this.scanCompleted = true;
                    // Даже при ошибке — даём рендерерам шанс (кэш мог быть частично заполнен)
                    for (const renderer of this.fsrsTableRenderers) {
                        renderer.refresh().catch(console.error);
                    }
                });
        });

        // Регистрация процессора для кнопки повторения карточки
        this.registerMarkdownCodeBlockProcessor(
            "fsrs-review-button",
            (_source, el, ctx) => {
                // Создаем контейнер для кнопки
                const buttonContainer = createDiv();
                buttonContainer.className = "fsrs-review-button-container";
                el.appendChild(buttonContainer);

                // Создаем рендерер кнопки
                const renderer = new ReviewButtonRenderer(
                    this,
                    buttonContainer,
                    ctx.sourcePath,
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

        // Регистрация обработчиков изменений файлов для кэша WASM
        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                this.cache.removeCard(file.path);
                this.notifyFsrsTableRenderers();
            }),
        );
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                this.cache.removeCard(oldPath);
                this.notifyFsrsTableRenderers();
                this.scheduleCardScan(file.path);
            }),
        );
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
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
            this.isWasmInitialized = true;
        } catch (error) {
            console.error("Ошибка загрузки WASM модуля:", error);
            showNotice("notices.wasm_not_ready");
            this.isWasmInitialized = false;
        }
    }

    /**
     * Получает карточки с кэшированными состояниями.
     * Кэш инвалидируется при изменении файлов или настроек.
     */
    getCachedCardsWithState(): CachedCard[] {
        return this.cache.getAll();
    }

    /**
     * Сканирование всех markdown-файлов хранилища.
     * Читает файлы, парсит frontmatter, вычисляет состояния
     * и отправляет в WASM-кэш через addOrUpdateCards.
     */
    async performCacheScan(
        onProgress?: (current: number, total: number) => void,
    ): Promise<void> {
        const start = performance.now();
        const files = this.app.vault
            .getMarkdownFiles()
            .sort((a, b) => a.path.localeCompare(b.path));

        // Очищаем кэш перед сканированием
        this.cache.clear();

        let filteredCount = 0;
        let noFrontmatterCount = 0;
        let skippedCount = 0;
        const batch: CacheCardInput[] = [];

        for (const file of files) {
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
                const content = await this.app.vault.read(file);
                const frontmatter = extractFrontmatter(content);
                if (!frontmatter) {
                    noFrontmatterCount++;
                    continue;
                }
                const parseResult = parseModernFsrsFromFrontmatter(
                    frontmatter,
                    file.path,
                );
                if (parseResult.success && parseResult.card) {
                    const state = computeCardState(
                        parseResult.card,
                        this.settings,
                    );
                    batch.push({
                        filePath: file.path,
                        card: parseResult.card,
                        state,
                    });
                } else {
                    skippedCount++;
                }
            } catch {
                skippedCount++;
            }
        }

        // Отправляем все карточки в WASM
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

            const parseResult = parseModernFsrsFromFrontmatter(
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
     * Находит карточки для повторения
     * Реализация для команды плагина
     */
    async findCardsForReview(): Promise<void> {
        await findFsrsCards(this);
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
     * Выгрузка плагина
     */
    onunload() {
        verboseLog("Выгрузка FSRS плагина");
        this.isWasmInitialized = false;
        this.fsrsTableRenderers.clear();

        // Сбрасываем флаг уведомлений рендереров
        this.notifyRenderersScheduled = false;

        // Очищаем pending сканирования
        this.pendingScans.clear();

        if (this.statusBarManager) {
            this.statusBarManager.unload();
            this.statusBarManager = null;
        }
    }

    /**
     * Регистрирует активный рендерер fsrs-table для уведомлений об обновлениях
     */
    registerFsrsTableRenderer(renderer: FsrsTableRenderer): void {
        this.fsrsTableRenderers.add(renderer);
        // Если сканирование уже завершено — запускаем рендер сразу.
        // Если нет — сканирование само уведомит все зарегистрированные рендереры
        // через refresh() в .then().
        if (this.scanCompleted) {
            renderer.refresh().catch(console.error);
        }
    }

    /**
     * Удаляет рендерер fsrs-table из списка активных
     */
    unregisterFsrsTableRenderer(renderer: FsrsTableRenderer): void {
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
