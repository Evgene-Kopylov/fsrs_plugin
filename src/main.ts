import { Plugin, Notice } from "obsidian";
import { registerCommands } from "./commands/index";
import { addFsrsFieldsToCurrentFile } from "./commands/add-fsrs-fields";
import { findFsrsCards } from "./commands/find-fsrs-cards";
import { reviewCurrentCard } from "./commands/review-current-card";
import { FsrsNowRenderer } from "./ui/fsrs-now-renderer";
import { MyPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { SampleSettingTab } from "./settings";
import { base64ToBytes } from "./utils/fsrs-helper";
import {
	parseModernFsrsFromFrontmatter,
	filterCardsForReview,
	sortCardsByPriority,
} from "./utils/fsrs-helper";
import type { ModernFSRSCard, FSRSCard } from "./interfaces/fsrs";

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
		try {
			console.log(
				"Сканирование хранилища на наличие карточек FSRS (новый формат)...",
			);

			// Получаем все markdown файлы
			const files = this.app.vault.getMarkdownFiles();
			const cards: ModernFSRSCard[] = [];

			for (const file of files) {
				try {
					const content = await this.app.vault.read(file);

					// Ищем frontmatter
					const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
					const match = frontmatterRegex.exec(content);

					if (match && match[1]) {
						const frontmatter = match[1]!;

						// Парсим карточку в новом формате
						const parseResult = parseModernFsrsFromFrontmatter(
							frontmatter,
							file.path,
						);
						if (parseResult.success && parseResult.card) {
							cards.push(parseResult.card);
						}
					}
				} catch (error) {
					console.warn(
						`Ошибка при чтении файла ${file.path}:`,
						error,
					);
				}
			}

			console.log(
				`Найдено карточек FSRS (новый формат): ${cards.length}`,
			);
			return cards;
		} catch (error) {
			console.error(
				"Ошибка при получении карточек для повторения:",
				error,
			);
			throw error;
		}
	}

	/**
	 * Добавляет поля FSRS в текущий файл
	 * Реализация для команды плагина
	 */
	async addFsrsFieldsToCurrentFile(): Promise<void> {
		await addFsrsFieldsToCurrentFile(this.app);
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
	}
}
