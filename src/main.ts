import { Plugin, Notice } from "obsidian";
import { registerCommands } from "./commands/index";
import { addFsrsFieldsToCurrentFile as addFsrsFieldsToCurrentFileFunction } from "./commands/add-fsrs-fields";
import { findFsrsCards } from "./commands/find-fsrs-cards";
import { reviewCurrentCard, reviewCardByPath } from "./commands/review";
import { FsrsNowRenderer } from "./ui/fsrs-now-renderer";
import { FsrsFutureRenderer } from "./ui/fsrs-future-renderer";
import { ReviewButtonRenderer } from "./ui/review-button-renderer";
import { MyPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { SampleSettingTab } from "./settings";
import { base64ToBytes } from "./utils/fsrs-helper";
import {
	parseModernFsrsFromFrontmatter,
	filterCardsForReview,
	sortCardsByPriority,
	shouldProcessFile,
	extractFrontmatter,
} from "./utils/fsrs-helper";
import { shouldIgnoreFileWithSettings } from "./utils/fsrs/fsrs-filter";
import type { ModernFSRSCard, FSRSCard, FSRSRating } from "./interfaces/fsrs";

// Импорт WASM функций
import init, { my_wasm_function } from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "../wasm-lib/pkg/wasm_lib_base64";

/**
 * Основной класс плагина FSRS для Obsidian
 * Интегрирует алгоритм интервального повторения FSRS в Obsidian
 */
export default class FsrsPlugin extends Plugin {
	settings: MyPluginSettings;
	private isWasmInitialized = false;
	private fsrsNowRenderers = new Set<FsrsNowRenderer>();
	private fsrsFutureRenderers = new Set<FsrsFutureRenderer>();

	/**
	 * Загрузка плагина
	 */
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));

		console.log("=== Загрузка FSRS плагина с WASM ===");

		// Инициализация WASM модуля
		await this.initializeWasm();

		// Регистрация команд плагина
		registerCommands(this);

		// Регистрация MarkdownCodeBlockProcessor для блоков fsrs-now
		this.registerMarkdownCodeBlockProcessor(
			"fsrs-now",
			async (source, el, ctx) => {
				// Создаем контейнер для рендеринга
				const renderContainer = document.createElement("div");
				renderContainer.className = "fsrs-now-render-container";
				el.appendChild(renderContainer);

				// Создаем и добавляем рендерер
				const renderer = new FsrsNowRenderer(
					this,
					renderContainer,
					ctx.sourcePath,
				);
				ctx.addChild(renderer);
			},
		);

		// Регистрация MarkdownCodeBlockProcessor для блоков fsrs-future
		this.registerMarkdownCodeBlockProcessor(
			"fsrs-future",
			async (source, el, ctx) => {
				// Создаем контейнер для рендеринга
				const renderContainer = document.createElement("div");
				renderContainer.className = "fsrs-future-render-container";
				el.appendChild(renderContainer);

				// Создаем и добавляем рендерер
				const renderer = new FsrsFutureRenderer(
					this,
					renderContainer,
					ctx.sourcePath,
				);
				ctx.addChild(renderer);
			},
		);

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

		console.log("FSRS плагин успешно загружен");
	}

	/**
	 * Инициализация WASM модуля
	 */
	private async initializeWasm(): Promise<void> {
		try {
			console.log("1. Конвертируем base64 в байты...");
			const wasmBytes = base64ToBytes(WASM_BASE64);
			console.log("2. Длина WASM байтов:", wasmBytes.length);

			console.log("3. Вызываем init...");
			await init({ module_or_path: wasmBytes });
			console.log("4. WASM инициализирован");

			// Тестовая функция для проверки работы WASM
			console.log("5. Вызываем тестовую функцию...");
			const result = my_wasm_function("тестовые данные из FSRS плагина");
			console.log("6. Результат из Rust:", result);

			console.log("7. Показываем Notice...");
			new Notice(result);
			console.log("8. Notice показано");

			this.isWasmInitialized = true;
		} catch (error) {
			console.error("Ошибка загрузки WASM модуля:", error);
			new Notice("Ошибка загрузки WASM компонента FSRS");
			this.isWasmInitialized = false;
		}
	}

	/**
	 * Получает все карточки FSRS из хранилища (новый формат с reviews)
	 */
	async getCardsForReview(): Promise<ModernFSRSCard[]> {
		const start = performance.now();
		try {
			console.log(
				"Сканирование хранилища на наличие карточек FSRS (новый формат)...",
			);

			// Получаем все markdown файлы
			const files = this.app.vault.getMarkdownFiles();
			const cards: ModernFSRSCard[] = [];

			console.log(`📁 Всего markdown файлов: ${files.length}`);

			for (const file of files) {
				// Пропускаем файлы, соответствующие паттернам игнорирования
				if (shouldIgnoreFileWithSettings(file.path, this.settings)) {
					continue;
				}

				try {
					const content = await this.app.vault.read(file);

					// Быстрая проверка: пропускаем файлы без признаков FSRS
					// 📊 Оптимизация дает ускорение >1000x (с ~950-1000 мс до ~0.7-0.8 мс)
					if (!shouldProcessFile(content)) {
						continue;
					}

					// Извлекаем frontmatter
					const frontmatter = extractFrontmatter(content);
					if (!frontmatter) {
						continue;
					}

					// Парсим карточку в новом формате
					const parseResult = parseModernFsrsFromFrontmatter(
						frontmatter,
						file.path,
					);

					if (parseResult.success && parseResult.card) {
						cards.push(parseResult.card);
					}
				} catch (error) {
					console.warn(
						`Ошибка при чтении файла ${file.path}:`,
						error,
					);
				}
			}

			console.log(`✅ Найдено карточек FSRS: ${cards.length}`);
			return cards;
		} catch (error) {
			console.error(
				"Ошибка при получении карточек для повторения:",
				error,
			);
			throw error;
		} finally {
			const elapsedMs = performance.now() - start;
			const elapsedSec = elapsedMs / 1000;
			console.log(
				`⏱️ Полное время сканирования карточек: ${elapsedSec.toFixed(2)} с`,
			);
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
	 * Находит карточки для повторения и вставляет блок fsrs-now
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
		console.log("Выгрузка FSRS плагина");
		this.isWasmInitialized = false;
		this.fsrsNowRenderers.clear();
	}

	/**
	 * Регистрирует активный рендерер fsrs-now для уведомлений об обновлениях
	 */
	registerFsrsNowRenderer(renderer: FsrsNowRenderer): void {
		this.fsrsNowRenderers.add(renderer);
	}

	/**
	 * Удаляет рендерер fsrs-now из списка активных
	 */
	unregisterFsrsNowRenderer(renderer: FsrsNowRenderer): void {
		this.fsrsNowRenderers.delete(renderer);
	}

	/**
	 * Уведомляет все активные рендереры fsrs-now об обновлении данных
	 */
	notifyFsrsNowRenderers(): void {
		for (const renderer of this.fsrsNowRenderers) {
			renderer.refresh().catch((error) => {
				console.error(
					"Ошибка при обновлении рендерера fsrs-now:",
					error,
				);
			});
		}
	}

	/**
	 * Регистрирует активный рендерер fsrs-future для уведомлений об обновлениях
	 */
	registerFsrsFutureRenderer(renderer: FsrsFutureRenderer): void {
		this.fsrsFutureRenderers.add(renderer);
	}

	/**
	 * Удаляет рендерер fsrs-future из списка активных
	 */
	unregisterFsrsFutureRenderer(renderer: FsrsFutureRenderer): void {
		this.fsrsFutureRenderers.delete(renderer);
	}

	/**
	 * Уведомляет все активные рендереры fsrs-future об обновлении данных
	 */
	notifyFsrsFutureRenderers(): void {
		for (const renderer of this.fsrsFutureRenderers) {
			renderer.refresh().catch((error) => {
				console.error(
					"Ошибка при обновлении рендерера fsrs-future:",
					error,
				);
			});
		}
	}
}
