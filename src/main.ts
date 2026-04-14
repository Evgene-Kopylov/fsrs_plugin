import { Plugin, Notice } from "obsidian";
import { registerCommands } from "./commands/index";
import { addFsrsFieldsToCurrentFile } from "./commands/add-fsrs-fields";
import { findFsrsCards } from "./commands/find-fsrs-cards";
import { reviewCurrentCard, reviewCardByPath } from "./commands/review";
import { FsrsNowRenderer } from "./ui/fsrs-now-renderer";
import { MyPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { SampleSettingTab } from "./settings";
import { base64ToBytes } from "./utils/fsrs-helper";
import {
	parseModernFsrsFromFrontmatter,
	filterCardsForReview,
	sortCardsByPriority,
} from "./utils/fsrs-helper";
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

		// Регистрация процессора для кнопки повторения карточки
		this.registerMarkdownCodeBlockProcessor(
			"fsrs-review-button",
			(source, el, ctx) => {
				// Создаем контейнер для кнопки
				const buttonContainer = document.createElement("div");
				buttonContainer.className = "fsrs-review-button-container";
				el.appendChild(buttonContainer);

				// Создаем кнопку
				const button = document.createElement("button");
				button.className = "fsrs-review-button";
				button.textContent = "Повторить карточку";
				buttonContainer.appendChild(button);

				// Сохраняем ссылку на плагин для использования в обработчике
				const plugin = this;

				// Добавляем обработчик клика
				button.addEventListener("click", async () => {
					try {
						const rating = await plugin.reviewCardByPath(
							ctx.sourcePath,
						);
						if (rating) {
							new Notice(
								`Карточка повторена с оценкой: ${rating}`,
							);
							// Обновляем текст кнопки
							button.textContent = `Повторено: ${rating}`;
							button.disabled = true;
							button.style.opacity = "0.7";
						}
					} catch (error) {
						console.error("Ошибка при повторении карточки:", error);
						new Notice("Ошибка при повторении карточки");
					}
				});
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

			console.log(`Всего markdown файлов: ${files.length}`);

			for (const file of files) {
				console.log(`=== Обработка файла: ${file.path} ===`);
				try {
					const content = await this.app.vault.read(file);

					// Ищем frontmatter
					const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
					const match = frontmatterRegex.exec(content);

					if (match && match[1]) {
						const frontmatter = match[1]!;
						console.log(
							`Найден frontmatter, длина: ${frontmatter.length}`,
						);

						// Парсим карточку в новом формате
						const parseResult = parseModernFsrsFromFrontmatter(
							frontmatter,
							file.path,
						);

						console.log(
							`Результат парсинга для ${file.path}:`,
							parseResult,
						);

						if (parseResult.success && parseResult.card) {
							console.log(
								`  ✅ Найдена карточка FSRS: ${file.path}, reviews: ${parseResult.card.reviews.length}`,
							);
							cards.push(parseResult.card);
						} else {
							console.log(
								`  ❌ Не FSRS карточка или ошибка парсинга: ${file.path}, ошибка: ${parseResult.error || "не указана"}`,
							);
						}
					} else {
						console.log(
							`  ℹ️ Нет frontmatter в файле: ${file.path}`,
						);
					}
				} catch (error) {
					console.warn(
						`Ошибка при чтении файла ${file.path}:`,
						error,
					);
				}
			}

			console.log(
				`=== Итог сканирования: найдено карточек FSRS (новый формат): ${cards.length} ===`,
			);
			console.log(
				"Найденные карточки:",
				cards.map((c) => ({
					path: c.filePath,
					reviews: c.reviews.length,
				})),
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
	}
}
