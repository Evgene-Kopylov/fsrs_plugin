import { Plugin, Notice, TAbstractFile } from "obsidian";
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

import { base64ToBytes } from "./utils/fsrs-helper";
import {
	parseModernFsrsFromFrontmatter,
	shouldProcessFile,
	extractFrontmatter,
	computeCardState,
} from "./utils/fsrs-helper";
import { shouldIgnoreFileWithSettings } from "./utils/fsrs/fsrs-filter";
import type { ModernFSRSCard, FSRSRating, CachedCard } from "./interfaces/fsrs";

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
	// Кэш с состояниями
	private cachedCardsWithState: CachedCard[] | null = null;
	private scanPromise: Promise<CachedCard[]> | null = null;
	public statusBarManager: StatusBarManager | null = null;
	private fileModifyHandler?: (file: TAbstractFile) => void;

	/**
	 * Загрузка плагина
	 */
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FsrsSettingTab(this.app, this));

		console.debug("=== Загрузка FSRS плагина с WASM ===");

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

		// Регистрация процессора для кнопки повторения карточки
		this.registerMarkdownCodeBlockProcessor(
			"fsrs-review-button",
			async (source, el, ctx) => {
				// Создаем контейнер для кнопки
				const buttonContainer = document.createElement("div");
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
			async (source, el, ctx) => {
				// Создаем контейнер для рендеринга
				const renderContainer = document.createElement("div");
				renderContainer.className = "fsrs-table-render-container";
				el.appendChild(renderContainer);

				// Получаем позиции блока для обновления исходного кода
				const sectionInfo = ctx.getSectionInfo(el);
				const sourceStart = sectionInfo?.lineStart ?? 0;
				const sourceEnd = sectionInfo?.lineEnd ?? 0;

				// Создаем и добавляем рендерер
				const renderer = new FsrsTableRenderer(
					this,
					renderContainer,
					ctx.sourcePath,
					source,
					sourceStart,
					sourceEnd,
				);
				ctx.addChild(renderer);
			},
		);

		// Регистрация обработчика изменений файлов для инвалидации кэша
		this.fileModifyHandler = () => this.invalidateCache();
		this.app.vault.on("modify", this.fileModifyHandler);

		console.debug("FSRS плагин успешно загружен");
	}

	/**
	 * Инициализация WASM модуля
	 */
	private async initializeWasm(): Promise<void> {
		try {
			console.debug("1. Конвертируем base64 в байты...");
			const wasmBytes = base64ToBytes(WASM_BASE64);
			console.debug("2. Длина WASM байтов:", wasmBytes.length);

			console.debug("3. Вызываем init...");
			await init({ module_or_path: wasmBytes });
			console.debug("4. WASM инициализирован");
			this.isWasmInitialized = true;
		} catch (error) {
			console.error("Ошибка загрузки WASM модуля:", error);
			new Notice("Ошибка загрузки WASM компонента FSRS"); // eslint-disable-line obsidianmd/ui/sentence-case
			this.isWasmInitialized = false;
		}
	}

	/**
	 * Получает карточки с кэшированными состояниями.
	 * Кэш инвалидируется при изменении файлов или настроек.
	 */
	async getCachedCardsWithState(): Promise<CachedCard[]> {
		if (this.cachedCardsWithState) return this.cachedCardsWithState;
		if (this.scanPromise) return this.scanPromise;
		this.scanPromise = this.performFullScan();
		try {
			this.cachedCardsWithState = await this.scanPromise;
			return this.cachedCardsWithState;
		} finally {
			this.scanPromise = null;
		}
	}

	/**
	 * Получает карточки для обратной совместимости (только карточки без состояний).
	 * @deprecated Используйте getCachedCardsWithState()
	 */
	async getCardsForReview(): Promise<ModernFSRSCard[]> {
		const cached = await this.getCachedCardsWithState();
		return cached.map((c) => c.card);
	}

	private async performFullScan(): Promise<CachedCard[]> {
		const start = performance.now();
		const files = this.app.vault.getMarkdownFiles();
		const cards: CachedCard[] = [];

		for (const file of files) {
			if (shouldIgnoreFileWithSettings(file.path, this.settings))
				continue;
			try {
				const content = await this.app.vault.read(file);
				if (!shouldProcessFile(content)) continue;
				const frontmatter = extractFrontmatter(content);
				if (!frontmatter) continue;
				const parseResult = parseModernFsrsFromFrontmatter(
					frontmatter,
					file.path,
				);
				if (parseResult.success && parseResult.card) {
					const state = await computeCardState(
						parseResult.card,
						this.settings,
					);
					cards.push({ card: parseResult.card, state });
				}
			} catch (error) {
				console.warn(`Ошибка при чтении файла ${file.path}:`, error);
			}
		}

		console.debug(`✅ Найдено карточек FSRS: ${cards.length}`);
		const elapsed = (performance.now() - start) / 1000;
		console.debug(
			`⏱️ Сканирование всего хранилища: ${elapsed.toFixed(2)} с`,
		);
		return cards;
	}

	/**
	 * Инвалидирует кэш карточек.
	 * Вызывается при изменении файлов или настроек.
	 */
	private invalidateCache(): void {
		this.cachedCardsWithState = null;
		this.scanPromise = null;
	}

	// Метод shouldIgnoreFile был вынесен в модуль fsrs-filter.ts
	// Используйте функцию shouldIgnoreFileWithSettings из импорта

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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	/**
	 * Сохраняет настройки плагина
	 */
	async saveSettings() {
		await this.saveData(this.settings);
		// Инвалидируем кэш при изменении настроек
		this.invalidateCache();
		// Обновляем статус-бар
		this.statusBarManager?.updateStatusBar();
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
		console.debug("Выгрузка FSRS плагина");
		this.isWasmInitialized = false;
		this.fsrsTableRenderers.clear();
		if (this.fileModifyHandler) {
			this.app.vault.off("modify", this.fileModifyHandler);
			this.fileModifyHandler = undefined;
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
			renderer.refresh().catch((error) => {
				console.error(
					"Ошибка при обновлении рендерера fsrs-table:",
					error,
				);
			});
		}
	}
}
