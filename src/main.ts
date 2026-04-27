import { Plugin } from "obsidian";
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

import { IncrementalCache } from "./utils/fsrs";
import { base64ToBytes } from "./utils/fsrs-helper";
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

    private fsrsTableRenderers = new Set<FsrsTableRenderer>();
    // Инкрементальный кэш карточек
    private cardCache!: IncrementalCache;
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

        // Инициализация инкрементального кэша карточек
        this.cardCache = new IncrementalCache(this.app, this.settings, () =>
            this.notifyFsrsTableRenderers(),
        );

        // Регистрация процессора для кнопки повторения карточки
        this.registerMarkdownCodeBlockProcessor(
            "fsrs-review-button",
            (_source, el, ctx) => {
                // Создаем контейнер для кнопки
                const buttonContainer = activeDocument.createDiv();
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
                const renderContainer = activeDocument.createDiv();
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

        // Регистрация обработчиков изменений файлов для инкрементального кэша
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file.path) this.cardCache.scheduleCardUpdate(file.path);
            }),
        );
        this.registerEvent(
            this.app.vault.on("delete", (file) => {
                this.cardCache.handleFileDelete(file);
            }),
        );
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                this.cardCache.handleFileRename(file, oldPath);
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
        return await this.cardCache.getCachedCardsWithState();
    }

    /**
     * Инвалидирует кэш карточек.
     * Вызывается при изменении файлов или настроек.
     */
    private invalidateCache(): void {
        this.cardCache.invalidateCache();
    }

    /**
     * Добавляет поля FSRS в текущий файл
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
        // Инвалидируем кэш при изменении настроек
        this.invalidateCache();
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
        // Очищаем все ресурсы инкрементального кэша
        if (this.cardCache) {
            this.cardCache.unload();
        }
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
     */
    notifyFsrsTableRenderers(): void {
        for (const renderer of this.fsrsTableRenderers) {
            renderer.refresh(true).catch((error) => {
                console.error(
                    "Ошибка при обновлении рендерера fsrs-table:",
                    error,
                );
            });
        }
    }
}
