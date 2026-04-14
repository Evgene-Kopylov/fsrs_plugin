// Взаимодействие с WASM модулем FSRS

import type {
	ModernFSRSCard,
	ReviewSession,
	FSRSRating,
	FSRSState,
	ComputedCardState,
	FSRSSettings,
	FSRSParameters,
} from "../../interfaces/fsrs";
import {
	compute_current_state,
	is_card_due,
	get_retrievability,
	review_card,
	get_fsrs_yaml,
	get_fsrs_yaml_after_review,
	get_next_review_dates,
	get_current_time,
	filter_cards_for_review,
	sort_cards_by_priority,
	group_cards_by_state,
	get_overdue_hours,
	get_hours_until_due,
	is_card_overdue,
	get_card_age_days,
} from "../../../wasm-lib/pkg/wasm_lib";

/**
 * Конвертирует параметры FSRS в JSON строку для WASM
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
 * Проверяет, готова ли карточка к повторению через WASM
 */
export async function isCardDue(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<boolean> {
	try {
		const cardJson = JSON.stringify({
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
 * Получает извлекаемость карточки через WASM
 */
export async function getCardRetrievability(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<number> {
	try {
		const cardJson = JSON.stringify({
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
 * Добавляет сессию повторения через WASM
 */
export async function addReviewSession(
	card: ModernFSRSCard,
	rating: FSRSRating,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard> {
	try {
		const cardJson = JSON.stringify({
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
 * Получает YAML новой карточки через WASM
 */
export async function getNewCardYaml(): Promise<string> {
	try {
		return get_fsrs_yaml();
	} catch (error) {
		console.error("Ошибка при получении YAML новой карточки:", error);
		return "reviews: []";
	}
}

/**
 * Получает YAML карточки после повторения через WASM
 */
export async function getCardYamlAfterReview(
	card: ModernFSRSCard,
	rating: FSRSRating,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<string> {
	try {
		const cardJson = JSON.stringify({
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
		return "reviews: []";
	}
}

/**
 * Получает даты следующего повторения для каждого рейтинга через WASM
 */
export async function getNextReviewDates(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<Record<FSRSRating, string | null>> {
	try {
		const cardJson = JSON.stringify({
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
 * Получает текущее время в ISO формате через WASM
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

/**
 * Валидирует JSON карточки FSRS
 */
export function validateFSRSCardJSON(json: string): boolean {
	try {
		const card = JSON.parse(json);
		return (
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
 * Создает карточку FSRS по умолчанию
 */
export function createDefaultFSRSCard(filePath: string): ModernFSRSCard {
	return {
		reviews: [],
		filePath,
	};
}

/**
 * Фильтрует карточки для повторения через WASM
 */
export async function filterCardsForReview(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	try {
		const cardsJson = JSON.stringify(cards);
		const settingsJson = JSON.stringify(settings);
		const nowStr = now.toISOString();

		const filteredJson = filter_cards_for_review(
			cardsJson,
			settingsJson,
			nowStr,
		);
		return JSON.parse(filteredJson);
	} catch (error) {
		console.error("Ошибка при фильтрации карточек:", error);
		return cards; // Возвращаем оригинальный массив в случае ошибки
	}
}

/**
 * Сортирует карточки по приоритету через WASM
 */
export async function sortCardsByPriority(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	try {
		const cardsJson = JSON.stringify(cards);
		const settingsJson = JSON.stringify(settings);
		const nowStr = now.toISOString();

		const sortedJson = sort_cards_by_priority(
			cardsJson,
			settingsJson,
			nowStr,
		);
		return JSON.parse(sortedJson);
	} catch (error) {
		console.error("Ошибка при сортировке карточек:", error);
		return cards; // Возвращаем оригинальный массив в случае ошибки
	}
}

/**
 * Группирует карточки по состоянию через WASM
 */
export async function groupCardsByState(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<{
	overdue: ModernFSRSCard[];
	due: ModernFSRSCard[];
	notDue: ModernFSRSCard[];
}> {
	try {
		const cardsJson = JSON.stringify(cards);
		const settingsJson = JSON.stringify(settings);
		const nowStr = now.toISOString();

		const groupedJson = group_cards_by_state(
			cardsJson,
			settingsJson,
			nowStr,
		);
		return JSON.parse(groupedJson);
	} catch (error) {
		console.error("Ошибка при группировке карточек:", error);
		return { overdue: [], due: [], notDue: cards }; // Возвращаем дефолтную группировку
	}
}

/**
 * Рассчитывает время просрочки карточки в часах через WASM
 */
export function getOverdueHours(dueDate: Date, now: Date = new Date()): number {
	try {
		const dueIso = dueDate.toISOString();
		const nowIso = now.toISOString();

		const hoursJson = get_overdue_hours(dueIso, nowIso);
		return JSON.parse(hoursJson);
	} catch (error) {
		console.error("Ошибка при расчете просрочки:", error);
		return 0;
	}
}

/**
 * Рассчитывает оставшееся время до повторения карточки в часах через WASM
 * Возвращает отрицательное значение если карточка просрочена
 */
export function getHoursUntilDue(
	dueDate: Date,
	now: Date = new Date(),
): number {
	try {
		const dueIso = dueDate.toISOString();
		const nowIso = now.toISOString();

		const hoursJson = get_hours_until_due(dueIso, nowIso);
		return JSON.parse(hoursJson);
	} catch (error) {
		console.error("Ошибка при расчете оставшегося времени:", error);
		return 0;
	}
}

/**
 * Проверяет, просрочена ли карточка через WASM
 */
export function isCardOverdue(dueDate: Date, now: Date = new Date()): boolean {
	try {
		const dueIso = dueDate.toISOString();
		const nowIso = now.toISOString();

		const overdueJson = is_card_overdue(dueIso, nowIso);
		return JSON.parse(overdueJson);
	} catch (error) {
		console.error("Ошибка при проверке просрочки:", error);
		return false;
	}
}

/**
 * Рассчитывает возраст карточки в днях через WASM (от первого повторения или создания)
 */
export function getCardAgeInDaysRust(
	card: ModernFSRSCard,
	now: Date = new Date(),
): number {
	try {
		const cardJson = JSON.stringify(card);
		const nowIso = now.toISOString();

		const ageJson = get_card_age_days(cardJson, nowIso);
		return JSON.parse(ageJson);
	} catch (error) {
		console.error("Ошибка при расчете возраста карточки:", error);
		return 0;
	}
}
