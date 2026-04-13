// Утилиты для работы с FSRS в новом формате с reviews

import type {
	ModernFSRSCard,
	ReviewSession,
	FSRSRating,
	FSRSState,
	ComputedCardState,
	FSRSSettings,
	FSRSParameters,
	ParseResult,
} from "../interfaces/fsrs";
import {
	compute_current_state,
	is_card_due,
	get_retrievability,
	review_card,
	get_fsrs_yaml,
	get_fsrs_yaml_after_review,
	get_next_review_dates,
	get_current_time,
} from "../../wasm-lib/pkg/wasm_lib";

/**
 * Парсит frontmatter файла и извлекает карточку в новом формате
 */
export function parseModernFsrsFromFrontmatter(
	frontmatter: string,
	filePath: string,
): ParseResult {
	try {
		// Пробуем распарсить YAML
		const parsed = parseYaml(frontmatter);
		if (!parsed) {
			return {
				success: false,
				card: null,
				error: "Failed to parse YAML",
			};
		}

		// Проверяем наличие флага srs
		if (parsed.srs !== true) {
			return {
				success: false,
				card: null,
				error: "srs flag is not true",
			};
		}

		// Проверяем наличие массива reviews
		if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
			return {
				success: false,
				card: null,
				error: "reviews array is missing or invalid",
			};
		}

		// Валидируем каждую сессию
		const reviews: ReviewSession[] = [];
		for (const session of parsed.reviews) {
			if (
				!session.date ||
				!session.rating ||
				typeof session.stability !== "number" ||
				typeof session.difficulty !== "number"
			) {
				console.warn(`Invalid review session in ${filePath}:`, session);
				continue;
			}

			reviews.push({
				date: session.date,
				rating: session.rating,
				stability: session.stability,
				difficulty: session.difficulty,
			});
		}

		const card: ModernFSRSCard = {
			srs: true,
			reviews,
			filePath,
		};

		return { success: true, card, error: undefined };
	} catch (error) {
		console.error(
			`Ошибка при парсинге FSRS полей из файла ${filePath}:`,
			error,
		);
		return {
			success: false,
			card: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// Улучшенный парсер YAML с поддержкой отступов и многострочных значений
function parseYaml(yaml: string): any {
	try {
		const lines = yaml.split("\n");
		const stack: Array<{ obj: any; key: string | null; indent: number }> =
			[];
		const root: any = {};
		let current: { obj: any; key: string | null; indent: number } = {
			obj: root,
			key: null,
			indent: -1,
		};
		let i = 0;

		while (i < lines.length) {
			const line = lines[i]!;
			const trimmed = line.trim();

			// Пропускаем пустые строки и комментарии
			if (trimmed === "" || trimmed.startsWith("#")) {
				i++;
				continue;
			}

			// Определяем уровень отступа
			const indent = line.search(/\S/);
			if (indent === -1) {
				i++;
				continue;
			}

			// Возвращаемся на нужный уровень в стеке
			while (
				stack.length > 0 &&
				indent <= stack[stack.length - 1]!.indent
			) {
				stack.pop();
			}
			if (stack.length > 0) {
				current = stack[stack.length - 1]!;
			} else {
				current = { obj: root, key: null, indent: -1 };
			}

			// Обработка элемента массива
			if (trimmed.startsWith("- ")) {
				const content = trimmed.substring(2).trim();

				// Если текущий объект не массив, создаем его
				if (!Array.isArray(current.obj[current.key!])) {
					current.obj[current.key!] = [];
				}

				const array = current.obj[current.key!] as any[];

				if (content.includes(":")) {
					// Объект внутри массива - делим только по первому двоеточию
					const colonIndex = content.indexOf(":");
					const key = content.substring(0, colonIndex).trim();
					const value = content.substring(colonIndex + 1).trim();

					const item: any = {};
					item[key] = parseYamlValue(value);
					array.push(item);

					// Добавляем в стек для возможных вложенных элементов
					stack.push({
						obj: item,
						key: key,
						indent: indent,
					});
				} else {
					// Простое значение в массиве
					array.push(parseYamlValue(content));
				}
			} else if (trimmed.includes(":")) {
				// Обработка пары ключ-значение
				const colonIndex = trimmed.indexOf(":");
				const key = trimmed.substring(0, colonIndex).trim();
				let value = trimmed.substring(colonIndex + 1).trim();

				// Проверяем, является ли значение массивом (следующая строка начинается с "-")
				if (value === "" && i + 1 < lines.length) {
					const nextLine = lines[i + 1]!;
					const nextIndent = nextLine.search(/\S/);
					if (
						nextIndent > indent &&
						nextLine.trim().startsWith("-")
					) {
						// Это начало массива
						current.obj[key] = [];
						stack.push({
							obj: current.obj,
							key: key,
							indent: indent,
						});
						i++;
						continue;
					}
				}

				// Обычное значение
				current.obj[key] = parseYamlValue(value);

				// Если значение объект (пустая строка после двоеточия), добавляем в стек
				if (value === "" && i + 1 < lines.length) {
					const nextLine = lines[i + 1]!;
					const nextIndent = nextLine.search(/\S/);
					if (nextIndent > indent && nextLine.includes(":")) {
						current.obj[key] = {};
						stack.push({
							obj: current.obj[key],
							key: null,
							indent: indent,
						});
					}
				}
			}

			i++;
		}

		return root;
	} catch (error) {
		console.error("Ошибка при парсинге YAML:", error);
		return null;
	}
}

/**
 * Парсит значение YAML
 */
function parseYamlValue(valueStr: string): any {
	if (valueStr === "true") return true;
	if (valueStr === "false") return false;
	if (valueStr === "null") return null;
	if (valueStr === "[]") return [];
	if (valueStr === "{}") return {};

	// Числа
	const trimmed = valueStr.trim();
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		const num = parseFloat(trimmed);
		return isNaN(num) ? trimmed : num;
	}

	// Строки в кавычках
	if (
		(valueStr.startsWith('"') && valueStr.endsWith('"')) ||
		(valueStr.startsWith("'") && valueStr.endsWith("'"))
	) {
		return valueStr.substring(1, valueStr.length - 1);
	}

	// Простые строки
	return valueStr;
}

/**
 * Преобразует параметры FSRS в JSON для WASM
 */
export function parametersToJson(parameters: FSRSParameters): string {
	return JSON.stringify({
		request_retention: parameters.request_retention,
		maximum_interval: parameters.maximum_interval,
		enable_fuzz: parameters.enable_fuzz,
	});
}

/**
 * Вычисляет текущее состояние карточки через WASM
 */
export async function computeCardState(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ComputedCardState> {
	try {
		const cardJson = JSON.stringify({
			srs: card.srs,
			reviews: card.reviews,
		});

		const parametersJson = parametersToJson(settings.parameters);
		const nowStr = now.toISOString();

		const stateJson = compute_current_state(
			cardJson,
			nowStr,
			parametersJson,
			settings.default_initial_stability,
			settings.default_initial_difficulty,
		);

		const state: ComputedCardState = JSON.parse(stateJson);
		return state;
	} catch (error) {
		console.error("Ошибка при вычислении состояния карточки:", error);
		// Возвращаем дефолтное состояние в случае ошибки
		return {
			due: now.toISOString(),
			stability: settings.default_initial_stability,
			difficulty: settings.default_initial_difficulty,
			state: "New",
			elapsed_days: 0,
			scheduled_days: 0,
			reps: 0,
			lapses: 0,
			retrievability: 1.0,
		};
	}
}

/**
 * Проверяет, готова ли карточка к повторению
 */
export async function isCardDue(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<boolean> {
	try {
		const cardJson = JSON.stringify({
			srs: card.srs,
			reviews: card.reviews,
		});

		const parametersJson = parametersToJson(settings.parameters);
		const nowStr = now.toISOString();

		const dueJson = is_card_due(
			cardJson,
			nowStr,
			parametersJson,
			settings.default_initial_stability,
			settings.default_initial_difficulty,
		);

		return JSON.parse(dueJson);
	} catch (error) {
		console.error("Ошибка при проверке готовности карточки:", error);
		return false;
	}
}

/**
 * Получает извлекаемость карточки
 */
export async function getCardRetrievability(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<number> {
	try {
		const cardJson = JSON.stringify({
			srs: card.srs,
			reviews: card.reviews,
		});

		const parametersJson = parametersToJson(settings.parameters);
		const nowStr = now.toISOString();

		const retrievabilityJson = get_retrievability(
			cardJson,
			nowStr,
			parametersJson,
			settings.default_initial_stability,
			settings.default_initial_difficulty,
		);

		return JSON.parse(retrievabilityJson);
	} catch (error) {
		console.error("Ошибка при получении извлекаемости:", error);
		return 1.0;
	}
}

/**
 * Добавляет сессию повторения к карточке
 */
export async function addReviewSession(
	card: ModernFSRSCard,
	rating: FSRSRating,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard> {
	try {
		const cardJson = JSON.stringify({
			srs: card.srs,
			reviews: card.reviews,
		});

		const parametersJson = parametersToJson(settings.parameters);
		const nowStr = now.toISOString();

		const updatedCardJson = review_card(
			cardJson,
			rating,
			nowStr,
			parametersJson,
			settings.default_initial_stability,
			settings.default_initial_difficulty,
		);

		const updatedCard = JSON.parse(updatedCardJson);
		return {
			...updatedCard,
			filePath: card.filePath,
		};
	} catch (error) {
		console.error("Ошибка при добавлении сессии повторения:", error);
		// В случае ошибки возвращаем оригинальную карточку
		return card;
	}
}

/**
 * Получает YAML для новой карточки
 */
export async function getNewCardYaml(): Promise<string> {
	try {
		return get_fsrs_yaml();
	} catch (error) {
		console.error("Ошибка при получении YAML новой карточки:", error);
		return "srs: true\nreviews: []";
	}
}

/**
 * Получает YAML после повторения карточки
 */
export async function getCardYamlAfterReview(
	card: ModernFSRSCard,
	rating: FSRSRating,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<string> {
	try {
		const cardJson = JSON.stringify({
			srs: card.srs,
			reviews: card.reviews,
		});

		const parametersJson = parametersToJson(settings.parameters);
		const nowStr = now.toISOString();

		return get_fsrs_yaml_after_review(
			cardJson,
			rating,
			nowStr,
			parametersJson,
			settings.default_initial_stability,
			settings.default_initial_difficulty,
		);
	} catch (error) {
		console.error("Ошибка при получении YAML после повторения:", error);
		return "srs: true\nreviews: []";
	}
}

/**
 * Получает возможные даты следующего повторения для всех оценок
 */
export async function getNextReviewDates(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<Record<FSRSRating, string | null>> {
	try {
		const cardJson = JSON.stringify({
			srs: card.srs,
			reviews: card.reviews,
		});

		const parametersJson = parametersToJson(settings.parameters);
		const nowStr = now.toISOString();

		const datesJson = get_next_review_dates(
			cardJson,
			nowStr,
			parametersJson,
			settings.default_initial_stability,
			settings.default_initial_difficulty,
		);

		const dates = JSON.parse(datesJson);
		return {
			Again: dates.again || null,
			Hard: dates.hard || null,
			Good: dates.good || null,
			Easy: dates.easy || null,
		};
	} catch (error) {
		console.error("Ошибка при получении дат следующего повторения:", error);
		return {
			Again: null,
			Hard: null,
			Good: null,
			Easy: null,
		};
	}
}

/**
 * Получает текущее время в формате ISO 8601
 */
export function getCurrentISOTime(): string {
	try {
		return get_current_time();
	} catch (error) {
		console.error("Ошибка при получении текущего времени:", error);
		return new Date().toISOString();
	}
}

/**
 * Форматирует время просрочки в читаемый вид
 */
export function formatOverdueTime(hours: number): string {
	if (hours <= 0) return "по графику";

	const days = Math.floor(hours / 24);
	const remainingHours = hours % 24;

	const parts: string[] = [];
	if (days > 0) {
		parts.push(`${days} ${getRussianNoun(days, "день", "дня", "дней")}`);
	}
	if (remainingHours > 0) {
		parts.push(
			`${remainingHours} ${getRussianNoun(remainingHours, "час", "часа", "часов")}`,
		);
	}

	return parts.join(" ");
}

/**
 * Вспомогательная функция для склонения русских существительных
 */
export function getRussianNoun(
	number: number,
	one: string,
	two: string,
	five: string,
): string {
	const n = Math.abs(number) % 100;
	const n1 = n % 10;

	if (n > 10 && n < 20) return five;
	if (n1 > 1 && n1 < 5) return two;
	if (n1 === 1) return one;
	return five;
}

/**
 * Рассчитывает время просрочки карточки в часах
 */
export function getOverdueHours(dueDate: Date, now: Date = new Date()): number {
	try {
		const diffMs = now.getTime() - dueDate.getTime();
		return Math.floor(diffMs / (1000 * 60 * 60));
	} catch (error) {
		console.error("Ошибка при расчете просрочки:", error);
		return 0;
	}
}

/**
 * Генерирует HTML для отображения карточки в блоке fsrs-now
 */
export function generateCardHTML(
	card: ModernFSRSCard,
	computedState: ComputedCardState,
	index: number,
	settings: FSRSSettings,
	now: Date = new Date(),
): string {
	const overdueHours = getOverdueHours(new Date(computedState.due), now);
	const overdueText = formatOverdueTime(overdueHours);

	// Форматируем дату следующего повторения
	const dueDate = new Date(computedState.due);
	const dueDateStr = dueDate.toLocaleString();

	let html = `<div class="fsrs-now-card" data-state="${computedState.state}">`;
	html += `<div class="fsrs-now-card-header">`;
	html += `<strong>${index + 1}. <a href="#" data-file-path="${
		card.filePath
	}" class="internal-link fsrs-now-link">${card.filePath}</a></strong>`;
	html += `</div>`;
	html += `<div class="fsrs-now-card-content">`;
	html += `<small>`;

	// Основная информация
	html += `<span class="fsrs-now-field"><strong>Просрочено:</strong> ${overdueText}</span><br>`;
	html += `<span class="fsrs-now-field"><strong>Состояние:</strong> ${computedState.state}`;
	html += ` | <strong>Повторений:</strong> ${card.reviews.length}`;
	html += `</span><br>`;

	// Статистика (если включена в настройках)
	if (settings.show_stability) {
		html += `<span class="fsrs-now-field"><strong>Стабильность:</strong> ${computedState.stability.toFixed(
			2,
		)}</span><br>`;
	}

	if (settings.show_difficulty) {
		html += `<span class="fsrs-now-field"><strong>Сложность:</strong> ${computedState.difficulty.toFixed(
			2,
		)}</span><br>`;
	}

	if (settings.show_retrievability) {
		html += `<span class="fsrs-now-field"><strong>Извлекаемость:</strong> ${(
			computedState.retrievability * 100
		).toFixed(1)}%</span><br>`;
	}

	// Расширенная статистика (если включена)
	if (settings.show_advanced_stats) {
		html += `<span class="fsrs-now-field"><strong>Прошло дней:</strong> ${computedState.elapsed_days}`;
		html += ` | <strong>Запланировано:</strong> ${computedState.scheduled_days}</span><br>`;
		html += `<span class="fsrs-now-field"><strong>Всего повторений:</strong> ${computedState.reps}`;
		html += ` | <strong>Ошибок:</strong> ${computedState.lapses}</span><br>`;
	}

	// Дата следующего повторения
	html += `<span class="fsrs-now-field"><strong>Дата повторения:</strong> ${dueDateStr}</span><br>`;

	html += `</small>`;
	html += `</div>`;
	html += `</div><br>`;

	return html;
}

/**
 * Генерирует полный HTML для блока fsrs-now
 */
export async function generateFsrsNowHTML(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<string> {
	const maxCardsToShow = settings.max_cards_to_show || 30;
	const cardsToShow = cards.slice(0, maxCardsToShow);

	let html = `<div class="fsrs-now-container">`;
	html += `<h4>Карточки для повторения (${cards.length})</h4>`;
	html += `<small>Обновлено: ${now.toLocaleString()}</small><br><br>`;

	for (let i = 0; i < cardsToShow.length; i++) {
		const card = cardsToShow[i];
		if (!card) continue;
		try {
			const computedState = await computeCardState(card, settings, now);
			html += generateCardHTML(card, computedState, i, settings, now);
		} catch (error) {
			console.error(
				`Ошибка при генерации HTML для карточки ${card.filePath}:`,
				error,
			);
			html += `<div class="fsrs-now-card fsrs-now-error">`;
			html += `<strong>${i + 1}. ${card.filePath}</strong><br>`;
			html += `<small>Ошибка при загрузке карточки</small>`;
			html += `</div><br>`;
		}
	}

	if (cards.length > maxCardsToShow) {
		const hiddenCount = cards.length - maxCardsToShow;
		html += `<div class="fsrs-now-info">`;
		html += `<small>Показано: ${maxCardsToShow} из ${cards.length} карточек (${hiddenCount} скрыто)</small>`;
		html += `</div>`;
	}

	html += `<div class="fsrs-now-footer">`;
	html += `<small>Для обновления списка выполните команду "Найти карточки для повторения"</small>`;
	html += `</div>`;
	html += `</div>`;

	return html;
}

/**
 * Сортирует карточки по приоритету повторения
 */
export async function sortCardsByPriority(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	const cardsWithPriority = await Promise.all(
		cards.map(async (card) => {
			try {
				const computedState = await computeCardState(
					card,
					settings,
					now,
				);
				const dueDate = new Date(computedState.due).getTime();
				const retrievability = computedState.retrievability;

				// Приоритет: сначала просроченные, затем по извлекаемости (меньше = выше приоритет)
				const priority = dueDate <= now.getTime() ? 0 : 1;
				const score = priority * 1000000 + (1 - retrievability) * 1000;

				return { card, score, dueDate };
			} catch (error) {
				console.error(
					`Ошибка при вычислении приоритета для карточки ${card.filePath}:`,
					error,
				);
				return { card, score: 9999999, dueDate: now.getTime() };
			}
		}),
	);

	// Сортируем по приоритету (меньше score = выше приоритет)
	cardsWithPriority.sort((a, b) => a.score - b.score);

	return cardsWithPriority.map((item) => item.card);
}

/**
 * Фильтрует карточки для повторения
 */
export async function filterCardsForReview(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	const filteredCards: ModernFSRSCard[] = [];

	for (const card of cards) {
		try {
			const isDue = await isCardDue(card, settings, now);
			if (isDue) {
				filteredCards.push(card);
			}
		} catch (error) {
			console.error(
				`Ошибка при фильтрации карточки ${card.filePath}:`,
				error,
			);
			// В случае ошибки включаем карточку для безопасности
			filteredCards.push(card);
		}
	}

	return filteredCards;
}

/**
 * Ограничивает количество карточек для отображения
 */
export function limitCards(
	cards: ModernFSRSCard[],
	max: number = 30,
): ModernFSRSCard[] {
	return cards.slice(0, max);
}

/**
 * Создает новую карточку FSRS с дефолтными значениями
 */
export function createDefaultFSRSCard(filePath: string): ModernFSRSCard {
	return {
		srs: true,
		reviews: [],
		filePath,
	};
}

/**
 * Валидирует JSON карточки FSRS
 */
export function validateFSRSCardJSON(json: string): boolean {
	try {
		const card = JSON.parse(json);
		return (
			typeof card.srs === "boolean" &&
			Array.isArray(card.reviews) &&
			card.reviews.every(
				(session: any) =>
					typeof session.date === "string" &&
					typeof session.rating === "string" &&
					typeof session.stability === "number" &&
					typeof session.difficulty === "number",
			)
		);
	} catch {
		return false;
	}
}

/**
 * Конвертирует base64 строку в Uint8Array для загрузки WASM модуля
 */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
