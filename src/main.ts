import { Plugin, TFile } from "obsidian";
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
import { RENDERER_DEBOUNCE_MS } from "./constants";

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

    private fsrsTableRenderers = new Set<FsrsTableRenderer>();
    // Кэш карточек в WASM
    public cache!: FsrsCache;
    // Ожидающие сканирования карточки (debounce)
    private pendingScans = new Map<string, number>();
    // Таймер debounce для уведомления рендереров (чтобы не перерисовывать 1000 раз)
    private notifyRenderersTimer: number | null = null;
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

        // Запуск прогрессивного сканирования хранилища
        void this.performCacheScan().then(() => {
            verboseLog("Сканирование хранилища завершено");
            this.notifyFsrsTableRenderers();
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
                    ctx.sourcePath,
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
                if (file.path) this.scheduleCardScan(file.path);
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
    async getCachedCardsWithState(): Promise<CachedCard[]> {
        return this.cache.getAll();
    }

    /**
     * Прогрессивное сканирование всех markdown-файлов хранилища.
     * Читает файлы чанками по 100, парсит frontmatter, вычисляет состояния
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

        let brokenCount = 0;
        const CHUNK_SIZE = 100;

        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);
            const batch: CacheCardInput[] = [];

            for (const file of chunk) {
                if (
                    shouldIgnoreFileWithSettings(
                        file.path,
                        this.settings,
                        this.app.vault.configDir,
                    )
                ) {
                    continue;
                }
                try {
                    const content = await this.app.vault.read(file);
                    const frontmatter = extractFrontmatter(content);
                    if (!frontmatter) continue;
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
                        brokenCount++;
                    }
                } catch {
                    brokenCount++;
                }
            }

            // Отправляем чанк в WASM
            if (batch.length > 0) {
                const result = this.cache.addOrUpdateCards(batch);
                if (result.errors.length > 0) {
                    verboseLog(
                        `Ошибки при добавлении карточек: ${result.errors.join(", ")}`,
                    );
                }
            }

            // Прогресс
            onProgress?.(Math.min(i + CHUNK_SIZE, files.length), files.length);

            // Отдаём управление браузеру
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        verboseLog(`✅ Найдено карточек FSRS: ${this.cache.size()}`);
        if (brokenCount > 0) {
            verboseLog(`⚠️ Пропущено битых карточек: ${brokenCount}`);
        }
        const elapsed = (performance.now() - start) / 1000;
        verboseLog(`⏱️ Сканирование всего хранилища: ${elapsed.toFixed(2)} с`);
    }

    /**
     * Планирует сканирование одной карточки с debounce (500 мс).
     * При повторном вызове для того же пути сбрасывает таймер.
     */
    private scheduleCardScan(filePath: string): void {
        const existing = this.pendingScans.get(filePath);
        if (existing) window.clearTimeout(existing);

        const timer = window.setTimeout(() => {
            void this.scanSingleCard(filePath);
            this.pendingScans.delete(filePath);
        }, 500);

        this.pendingScans.set(filePath, timer);
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
        await this.saveData(this.settings);
        // Очищаем кэш при изменении настроек (состояния изменятся)
        this.cache?.clear();
        this.notifyFsrsTableRenderers();
        // Обновляем статус-бар
        void this.statusBarManager?.updateStatusBar();
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

        // Очищаем таймер debounce уведомлений рендереров
        if (this.notifyRenderersTimer !== null) {
            window.clearTimeout(this.notifyRenderersTimer);
            this.notifyRenderersTimer = null;
        }

        // Очищаем pending таймеры
        for (const timer of this.pendingScans.values()) {
            window.clearTimeout(timer);
        }
        this.pendingScans.clear();

        // Очищаем кэш в WASM
        this.cache?.clear();

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
    }

    /**
     * Удаляет рендерер fsrs-table из списка активных
     */
    unregisterFsrsTableRenderer(renderer: FsrsTableRenderer): void {
        this.fsrsTableRenderers.delete(renderer);
    }

    /**
     * Уведомляет все активные рендереры fsrs-table об обновлении данных
     * с debounce — при частых вызовах перерендер происходит не чаще раза в 2 секунды.
     */
    notifyFsrsTableRenderers(): void {
        if (this.notifyRenderersTimer !== null) {
            window.clearTimeout(this.notifyRenderersTimer);
        }
        this.notifyRenderersTimer = window.setTimeout(() => {
            this.notifyRenderersTimer = null;
            for (const renderer of this.fsrsTableRenderers) {
                renderer.refresh(true).catch((error) => {
                    console.error(
                        "Ошибка при обновлении рендерера fsrs-table:",
                        error,
                    );
                });
            }
        }, RENDERER_DEBOUNCE_MS);
    }
}
