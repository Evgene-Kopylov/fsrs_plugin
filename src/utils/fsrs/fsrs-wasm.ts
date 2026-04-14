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
 * Проверяет, готова ли карточка к повторению через WASM
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
 * Получает извлекаемость карточки через WASM
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
 * Получает YAML новой карточки через WASM
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
 * Получает даты следующего повторения для каждого рейтинга через WASM
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
 * Создает карточку FSRS по умолчанию
 */
export function createDefaultFSRSCard(filePath: string): ModernFSRSCard {
	return {
		srs: true,
		reviews: [],
		filePath,
	};
}
