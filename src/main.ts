import { Plugin, Notice } from "obsidian";
import init, {
	my_wasm_function,
	get_fsrs_yaml,
	create_fsrs_card_json,
	review_card,
	get_fsrs_yaml_after_review,
	get_next_review_dates,
	is_card_due,
	get_retrievability,
	get_current_time,
	card_state_to_string,
} from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "../generated/wasm_base64";
import { MyPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { SampleSettingTab } from "./settings";

// Интерфейс для карточки FSRS
interface FSRSCard {
	due: string; // ISO 8601 строка
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	state: string;
	last_review: string;
	filePath: string; // путь к файлу
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export default class MyWasmPlugin extends Plugin {
	settings: MyPluginSettings;
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));

		console.log("=== Загрузка плагина с WASM ===");

		try {
			console.log("1. Конвертируем base64 в байты...");
			const wasmBytes = base64ToBytes(WASM_BASE64);
			console.log("2. Длина WASM байтов:", wasmBytes.length);

			console.log("3. Вызываем init...");
			await init({ module_or_path: wasmBytes });
			console.log("4. WASM инициализирован");

			console.log("5. Вызываем my_wasm_function...");
			const result = my_wasm_function("тестовые данные из Obsidian");
			console.log("6. Результат из Rust:", result);

			console.log("7. Показываем Notice...");
			new Notice(result);
			console.log("8. Notice показано");
		} catch (e) {
			console.error("Ошибка загрузки WASM модуля:", e);
			new Notice("Ошибка загрузки WASM компонента");
		}

		// Добавляем команду для вставки полей FSRS в шапку файла
		this.addCommand({
			id: "add-fsrs-fields",
			name: "Добавить поля FSRS в шапку файла",
			callback: async () => {
				await this.addFsrsFieldsToCurrentFile();
			},
		});

		// Добавляем команду для поиска карточек, готовых к повторению
		this.addCommand({
			id: "find-fsrs-cards",
			name: "Найти карточки для повторения",
			callback: async () => {
				await this.findCardsForReview();
			},
		});

		// Добавляем команду для повторения текущей карточки
		this.addCommand({
			id: "review-current-card",
			name: "Повторить текущую карточку",
			callback: async () => {
				await this.reviewCurrentCard();
			},
		});
	}

	onunload() {
		console.log("Выгрузка плагина");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Метод для добавления полей FSRS в текущий файл
	async addFsrsFieldsToCurrentFile() {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice("Нет активного файла");
				return;
			}

			console.log("Получение YAML полей FSRS из Rust...");
			const fsrsYaml = get_fsrs_yaml();
			console.log("FSRS YAML поля:", fsrsYaml);

			const fileContent = await this.app.vault.read(activeFile);
			let newContent = fileContent;

			// Проверяем, есть ли уже frontmatter в файле
			const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
			const match = frontmatterRegex.exec(fileContent);

			if (match) {
				// Есть frontmatter - добавляем поля FSRS после существующего frontmatter
				const existingFrontmatter = match[0];
				const afterFrontmatter = fileContent.slice(match[0].length);
				newContent =
					existingFrontmatter +
					"\n" +
					fsrsYaml +
					"\n" +
					afterFrontmatter;
			} else {
				// Нет frontmatter - создаем новый с полями FSRS
				newContent = "---\n" + fsrsYaml + "\n---\n\n" + fileContent;
			}

			// Сохраняем изменения
			await this.app.vault.modify(activeFile, newContent);

			new Notice("Поля FSRS добавлены в файл");
			console.log("Поля FSRS успешно добавлены в файл:", activeFile.name);

			// Также показываем JSON версию в консоли для отладки
			console.log("JSON версия карточки FSRS:", create_fsrs_card_json());
		} catch (error) {
			console.error("Ошибка при добавлении полей FSRS:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice("Ошибка при добавлении полей FSRS: " + errorMessage);
		}
	}

	// Метод для поиска карточек, готовых к повторению
	async findCardsForReview() {
		try {
			console.log("Поиск карточек FSRS для повторения...");

			// Получаем все файлы в хранилище
			const files = this.app.vault.getMarkdownFiles();
			const cardsForReview: FSRSCard[] = [];
			const now = new Date();

			for (const file of files) {
				try {
					const content = await this.app.vault.read(file);

					// Ищем frontmatter
					const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
					const match = frontmatterRegex.exec(content);

					if (match && match[1]) {
						const frontmatter = match[1]!;

						// Проверяем наличие полей FSRS
						const hasFsrsDue = /^fsrs_due:/m.test(frontmatter);
						const hasFsrsState = /^fsrs_state:/m.test(frontmatter);

						if (hasFsrsDue && hasFsrsState) {
							// Парсим поля FSRS
							const dueMatch = /^fsrs_due:\s*"([^"]+)"/m.exec(
								frontmatter,
							);
							const stabilityMatch =
								/^fsrs_stability:\s*([0-9.]+)/m.exec(
									frontmatter,
								);
							const difficultyMatch =
								/^fsrs_difficulty:\s*([0-9.]+)/m.exec(
									frontmatter,
								);
							const elapsedDaysMatch =
								/^fsrs_elapsed_days:\s*([0-9]+)/m.exec(
									frontmatter,
								);
							const scheduledDaysMatch =
								/^fsrs_scheduled_days:\s*([0-9]+)/m.exec(
									frontmatter,
								);
							const repsMatch = /^fsrs_reps:\s*([0-9]+)/m.exec(
								frontmatter,
							);
							const lapsesMatch =
								/^fsrs_lapses:\s*([0-9]+)/m.exec(frontmatter);
							const stateMatch = /^fsrs_state:\s*"([^"]+)"/m.exec(
								frontmatter,
							);
							const lastReviewMatch =
								/^fsrs_last_review:\s*"([^"]+)"/m.exec(
									frontmatter,
								);

							if (dueMatch && dueMatch[1]) {
								const dueDate = new Date(dueMatch[1]!);

								// Проверяем, прошла ли дата повторения
								if (dueDate <= now) {
									const card: FSRSCard = {
										due: dueMatch[1]!,
										stability:
											stabilityMatch && stabilityMatch[1]
												? parseFloat(stabilityMatch[1]!)
												: 0,
										difficulty:
											difficultyMatch &&
											difficultyMatch[1]
												? parseFloat(
														difficultyMatch[1]!,
													)
												: 0,
										elapsed_days:
											elapsedDaysMatch &&
											elapsedDaysMatch[1]
												? parseInt(elapsedDaysMatch[1]!)
												: 0,
										scheduled_days:
											scheduledDaysMatch &&
											scheduledDaysMatch[1]
												? parseInt(
														scheduledDaysMatch[1]!,
													)
												: 0,
										reps:
											repsMatch && repsMatch[1]
												? parseInt(repsMatch[1]!)
												: 0,
										lapses:
											lapsesMatch && lapsesMatch[1]
												? parseInt(lapsesMatch[1]!)
												: 0,
										state:
											stateMatch && stateMatch[1]
												? stateMatch[1]!
												: "New",
										last_review:
											lastReviewMatch &&
											lastReviewMatch[1]
												? lastReviewMatch[1]!
												: new Date().toISOString(),
										filePath: file.path,
									};

									cardsForReview.push(card);
								}
							}
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
				`Найдено карточек для повторения: ${cardsForReview.length}`,
			);

			if (cardsForReview.length === 0) {
				new Notice("Нет карточек для повторения");
				return;
			}

			// Сортируем по дате повторения (самые старые первыми)
			cardsForReview.sort(
				(a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
			);

			// Создаем сообщение для пользователя
			let message = `Карточки для повторения (${cardsForReview.length}):\n\n`;

			cardsForReview.slice(0, 10).forEach((card, index) => {
				const dueDate = new Date(card.due);
				const hoursDiff = Math.floor(
					(now.getTime() - dueDate.getTime()) / (1000 * 60 * 60),
				);

				message += `${index + 1}. ${card.filePath}\n`;
				message += `   Просрочено: ${hoursDiff} часов\n`;
				message += `   Состояние: ${card.state}, Повторений: ${card.reps}\n\n`;
			});

			if (cardsForReview.length > 10) {
				message += `... и еще ${cardsForReview.length - 10} карточек`;
			}

			new Notice(message);

			// Также выводим в консоль для отладки
			console.log("Карточки для повторения:", cardsForReview);
		} catch (error) {
			console.error("Ошибка при поиске карточек для повторения:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice(
				"Ошибка при поиске карточек для повторения: " + errorMessage,
			);
		}
	}

	// Метод для повторения текущей карточки
	async reviewCurrentCard() {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice("Нет активного файла");
				return;
			}

			const content = await this.app.vault.read(activeFile);

			// Ищем frontmatter с полями FSRS
			const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
			const match = frontmatterRegex.exec(content);

			if (!match || !match[1]) {
				new Notice("Файл не содержит полей FSRS в frontmatter");
				return;
			}

			const frontmatter = match[1]!;

			// Проверяем наличие полей FSRS
			const hasFsrsDue = /^fsrs_due:/m.test(frontmatter);
			if (!hasFsrsDue) {
				new Notice("Файл не содержит полей FSRS");
				return;
			}

			// Собираем поля FSRS в JSON
			const dueMatch = /^fsrs_due:\s*"([^"]+)"/m.exec(frontmatter);
			const stabilityMatch = /^fsrs_stability:\s*([0-9.]+)/m.exec(
				frontmatter,
			);
			const difficultyMatch = /^fsrs_difficulty:\s*([0-9.]+)/m.exec(
				frontmatter,
			);
			const elapsedDaysMatch = /^fsrs_elapsed_days:\s*([0-9]+)/m.exec(
				frontmatter,
			);
			const scheduledDaysMatch = /^fsrs_scheduled_days:\s*([0-9]+)/m.exec(
				frontmatter,
			);
			const repsMatch = /^fsrs_reps:\s*([0-9]+)/m.exec(frontmatter);
			const lapsesMatch = /^fsrs_lapses:\s*([0-9]+)/m.exec(frontmatter);
			const stateMatch = /^fsrs_state:\s*"([^"]+)"/m.exec(frontmatter);
			const lastReviewMatch = /^fsrs_last_review:\s*"([^"]+)"/m.exec(
				frontmatter,
			);

			if (!dueMatch || !dueMatch[1]) {
				new Notice("Не удалось найти поле fsrs_due");
				return;
			}

			// Создаем JSON карточки
			const cardData = {
				due: dueMatch[1]!,
				stability:
					stabilityMatch && stabilityMatch[1]
						? parseFloat(stabilityMatch[1]!)
						: 0,
				difficulty:
					difficultyMatch && difficultyMatch[1]
						? parseFloat(difficultyMatch[1]!)
						: 0,
				elapsed_days:
					elapsedDaysMatch && elapsedDaysMatch[1]
						? parseInt(elapsedDaysMatch[1]!)
						: 0,
				scheduled_days:
					scheduledDaysMatch && scheduledDaysMatch[1]
						? parseInt(scheduledDaysMatch[1]!)
						: 0,
				reps: repsMatch && repsMatch[1] ? parseInt(repsMatch[1]!) : 0,
				lapses:
					lapsesMatch && lapsesMatch[1]
						? parseInt(lapsesMatch[1]!)
						: 0,
				state: stateMatch && stateMatch[1] ? stateMatch[1]! : "New",
				last_review:
					lastReviewMatch && lastReviewMatch[1]
						? lastReviewMatch[1]!
						: new Date().toISOString(),
			};

			const cardJson = JSON.stringify(cardData);
			const now = get_current_time();

			// Показываем меню с оценками
			const ratings = [
				{ name: "Again (Забыл)", value: "Again" },
				{ name: "Hard (С трудом)", value: "Hard" },
				{ name: "Good (Хорошо)", value: "Good" },
				{ name: "Easy (Очень легко)", value: "Easy" },
			];

			// В Obsidian можно использовать modal или заметку, для простоты используем Notice с кнопками
			// Здесь простейшая реализация - спрашиваем через prompt или создаем отдельный modal
			// Для простоты используем фиксированную оценку "Good" и сразу обновляем

			const rating = "Good"; // По умолчанию Good

			console.log("Обновление карточки с оценкой:", rating);
			console.log("JSON карточки:", cardJson);
			console.log("Текущее время:", now);

			// Обновляем карточку через WASM
			const updatedCardJson = review_card(cardJson, rating, now);
			console.log("Обновленная карточка:", updatedCardJson);

			// Получаем YAML с обновленными полями
			const updatedYaml = get_fsrs_yaml_after_review(
				cardJson,
				rating,
				now,
			);

			// Заменяем старый frontmatter на новый
			const newContent = content.replace(
				frontmatterRegex,
				"---\n" + updatedYaml + "\n---",
			);

			// Сохраняем изменения
			await this.app.vault.modify(activeFile, newContent);

			new Notice(`Карточка повторена с оценкой: ${rating}`);
			console.log("Карточка успешно обновлена");

			// Показываем следующие даты повторения
			const nextDatesJson = get_next_review_dates(updatedCardJson, now);
			const nextDates = JSON.parse(nextDatesJson);
			console.log("Следующие даты повторения:", nextDates);
		} catch (error) {
			console.error("Ошибка при повторении карточки:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice("Ошибка при повторении карточки: " + errorMessage);
		}
	}
}
