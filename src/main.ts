import { Plugin, Notice } from "obsidian";
import { registerCommands } from "./commands/index";
import { addFsrsFieldsToCurrentFile as addFsrsFieldsToCurrentFileFunction } from "./commands/add-fsrs-fields";
import { findFsrsCards } from "./commands/find-fsrs-cards";
import { reviewCurrentCard, reviewCardByPath } from "./commands/review";

import { ReviewButtonRenderer } from "./ui/review-button-renderer";
import { FsrsTableRenderer } from "./ui/fsrs-table-renderer";
import { FsrsPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { FsrsSettingTab } from "./settings";
import { CARD_CACHE_TTL_MS } from "./constants";
import { base64ToBytes } from "./utils/fsrs-helper";
import {
	parseModernFsrsFromFrontmatter,
	shouldProcessFile,
	extractFrontmatter,
} from "./utils/fsrs-helper";
import { shouldIgnoreFileWithSettings } from "./utils/fsrs/fsrs-filter";
import type { ModernFSRSCard, FSRSRating } from "./interfaces/fsrs";

// Импорт WASM функций
import init, { my_wasm_function } from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "../wasm-lib/pkg/wasm_lib_base64";

/**
 * Основной класс плагина FSRS для Obsidian
 * Интегрирует алгоритм интервального повторения FSRS в Obsidian
 */
export default class FsrsPlugin extends Plugin {
	settings: FsrsPluginSettings;
	private isWasmInitialized = false;

	private fsrsTableRenderers = new Set<FsrsTableRenderer>();
	// Кэш с TTL
	private cachedCards: ModernFSRSCard[] | null = null;
	private lastScanTime = 0;

	private isScanning = false;

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

			// Тестовая функция для проверки работы WASM
			console.debug("5. Вызываем тестовую функцию...");
			const result = my_wasm_function("тестовые данные из FSRS плагина");
			console.debug("6. Результат из Rust:", result);

			console.debug("7. Показываем Notice...");
			new Notice(result);
			console.debug("8. Notice показано");

			this.isWasmInitialized = true;
		} catch (error) {
			console.error("Ошибка загрузки WASM модуля:", error);
			new Notice("Ошибка загрузки WASM компонента FSRS"); // eslint-disable-line obsidianmd/ui/sentence-case
			this.isWasmInitialized = false;
		}
	}

	/**
	 * Получает карточки с кэшированием по TTL.
	 * Никакой ручной инвалидации — кэш устаревает сам через 5 секунд.
	 */
	async getCardsForReview(): Promise<ModernFSRSCard[]> {
		const now = Date.now();
		const cacheValid =
			this.cachedCards !== null &&
			now - this.lastScanTime < CARD_CACHE_TTL_MS;

		if (cacheValid) {
			// Возвращаем ссылку на кэш (без копирования)
			return this.cachedCards!;
		}

		if (this.isScanning) {
			await this.waitForScanCompletion();
			return this.cachedCards ?? [];
		}

		this.isScanning = true;
		try {
			const cards = await this.performFullScan();
			this.cachedCards = cards;
			this.lastScanTime = Date.now();
			return cards;
		} finally {
			this.isScanning = false;
		}
	}

	private async performFullScan(): Promise<ModernFSRSCard[]> {
		const start = performance.now();
		const files = this.app.vault.getMarkdownFiles();
		const cards: ModernFSRSCard[] = [];

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
				if (parseResult.success && parseResult.card)
					cards.push(parseResult.card);
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

	private async waitForScanCompletion(): Promise<void> {
		const start = Date.now();
		while (this.isScanning && Date.now() - start < 30000) {
			await new Promise((r) => setTimeout(r, 50));
		}
		if (this.isScanning) {
			console.warn("⚠️ Таймаут ожидания сканирования");
			this.isScanning = false;
		}
	}

	// Метод shouldIgnoreFile был вынесен в модуль fsrs-filter.ts
	// Используйте функцию shouldIgnoreFileWithSettings из импорта

	/**
	 * Добавляет поля FSRS в текущий файл
	 * Реализация для команды плагина
	 */
	async addFsrsFieldsToCurrentFile(): Promise<void> {
		await addFsrsFieldsToCurrentFileFunction(this.app, this.settings);
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
