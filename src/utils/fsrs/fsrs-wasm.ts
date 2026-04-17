// Взаимодействие с WASM модулем FSRS

import type {
	ModernFSRSCard,
	FSRSRating,
	ComputedCardState,
	FSRSSettings,
	FSRSParameters,
} from "../../interfaces/fsrs";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

// ---------- Утилиты для работы с WASM ----------

/** Преобразует карточку в JSON-строку для WASM */
const serializeCard = (card: ModernFSRSCard): string =>
	JSON.stringify({ reviews: card.reviews });

/** Преобразует параметры FSRS в JSON-строку для WASM */
export const parametersToJson = (p: FSRSParameters): string =>
	JSON.stringify({
		request_retention: p.request_retention,
		maximum_interval: p.maximum_interval,
		enable_fuzz: p.enable_fuzz,
	});

/** Подготовка общих аргументов для большинства функций */
const prepareCommonArgs = (
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date,
) => ({
	cardJson: serializeCard(card),
	nowStr: now.toISOString(),
	parametersJson: parametersToJson(settings.parameters),
	defaultStability: settings.default_initial_stability,
	defaultDifficulty: settings.default_initial_difficulty,
});

// ---------- Публичные API ----------

export async function computeCardState(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ComputedCardState> {
	try {
		const {
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		} = prepareCommonArgs(card, settings, now);
		const stateJson = wasm.compute_current_state(
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		);
		return JSON.parse(stateJson) as ComputedCardState;
	} catch (error) {
		console.error("computeCardState failed, returning default", error);
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

export async function isCardDue(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<boolean> {
	try {
		const {
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		} = prepareCommonArgs(card, settings, now);
		const dueJson = wasm.is_card_due(
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		);
		return JSON.parse(dueJson) as boolean;
	} catch {
		return false;
	}
}

export async function getCardRetrievability(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<number> {
	try {
		const {
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		} = prepareCommonArgs(card, settings, now);
		const retJson = wasm.get_retrievability(
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		);
		return JSON.parse(retJson) as number;
	} catch {
		return 1.0;
	}
}

export async function addReviewSession(
	card: ModernFSRSCard,
	rating: FSRSRating,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard> {
	try {
		const {
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		} = prepareCommonArgs(card, settings, now);
		const updatedJson = wasm.review_card(
			cardJson,
			rating,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		);
		const parsed = JSON.parse(updatedJson) as ModernFSRSCard;
		return { ...parsed, filePath: card.filePath };
	} catch (error) {
		console.error("addReviewSession failed", error);
		return card;
	}
}

export async function getNewCardYaml(): Promise<string> {
	try {
		return wasm.get_fsrs_yaml();
	} catch {
		return "reviews: []";
	}
}

export async function getCardYamlAfterReview(
	card: ModernFSRSCard,
	rating: FSRSRating,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<string> {
	try {
		const {
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		} = prepareCommonArgs(card, settings, now);
		return wasm.get_fsrs_yaml_after_review(
			cardJson,
			rating,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		);
	} catch {
		return "reviews: []";
	}
}

export async function getNextReviewDates(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<Record<FSRSRating, string | null>> {
	try {
		const {
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		} = prepareCommonArgs(card, settings, now);
		const datesJson = wasm.get_next_review_dates(
			cardJson,
			nowStr,
			parametersJson,
			defaultStability,
			defaultDifficulty,
		);
		const dates = JSON.parse(datesJson) as {
			again?: string;
			hard?: string;
			good?: string;
			easy?: string;
		};
		return {
			Again: dates.again || null,
			Hard: dates.hard || null,
			Good: dates.good || null,
			Easy: dates.easy || null,
		};
	} catch {
		return { Again: null, Hard: null, Good: null, Easy: null };
	}
}

export function getCurrentISOTime(): string {
	try {
		return wasm.get_current_time();
	} catch {
		return new Date().toISOString();
	}
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

interface ValidatedCard {
	reviews?: unknown[];
}

interface ValidatedReviewSession {
	date?: unknown;
	rating?: unknown;
	stability?: unknown;
	difficulty?: unknown;
}

export function validateFSRSCardJSON(json: string): boolean {
	try {
		const card = JSON.parse(json) as ValidatedCard;
		return (
			Array.isArray(card.reviews) &&
			card.reviews.every(
				(session: ValidatedReviewSession) =>
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

export function createDefaultFSRSCard(filePath: string): ModernFSRSCard {
	return { reviews: [], filePath };
}

// Функции фильтрации/сортировки/группировки, работающие с массивами
export async function filterCardsForReview(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	try {
		const cardsJson = JSON.stringify(cards);
		const settingsJson = JSON.stringify(settings);
		const nowStr = now.toISOString();
		const filteredJson = wasm.filter_cards_for_review(
			cardsJson,
			settingsJson,
			nowStr,
		);
		return JSON.parse(filteredJson) as ModernFSRSCard[];
	} catch {
		return cards;
	}
}

export async function sortCardsByPriority(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	try {
		const cardsJson = JSON.stringify(cards);
		const settingsJson = JSON.stringify(settings);
		const nowStr = now.toISOString();
		const sortedJson = wasm.sort_cards_by_priority(
			cardsJson,
			settingsJson,
			nowStr,
		);
		return JSON.parse(sortedJson) as ModernFSRSCard[];
	} catch {
		return cards;
	}
}

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
		const groupedJson = wasm.group_cards_by_state(
			cardsJson,
			settingsJson,
			nowStr,
		);
		const parsed = JSON.parse(groupedJson) as Record<
			string,
			ModernFSRSCard[]
		>;
		// конвертируем snake_case → camelCase
		const result: {
			overdue: ModernFSRSCard[];
			due: ModernFSRSCard[];
			notDue: ModernFSRSCard[];
		} = { overdue: [], due: [], notDue: [] };
		for (const key in parsed) {
			if (Object.prototype.hasOwnProperty.call(parsed, key)) {
				const newKey = key.replace(/_([a-z])/g, (_, l: string) =>
					l.toUpperCase(),
				) as "overdue" | "due" | "notDue";
				result[newKey] = parsed[key]!;
			}
		}
		return result;
	} catch {
		return { overdue: [], due: [], notDue: cards };
	}
}

// Функции для работы с датами
export function getOverdueHours(dueDate: Date, now: Date = new Date()): number {
	try {
		return JSON.parse(
			wasm.get_overdue_hours(dueDate.toISOString(), now.toISOString()),
		) as number;
	} catch {
		return 0;
	}
}

export function getHoursUntilDue(
	dueDate: Date,
	now: Date = new Date(),
): number {
	try {
		return JSON.parse(
			wasm.get_hours_until_due(dueDate.toISOString(), now.toISOString()),
		) as number;
	} catch {
		return 0;
	}
}

export function isCardOverdue(dueDate: Date, now: Date = new Date()): boolean {
	try {
		return JSON.parse(
			wasm.is_card_overdue(dueDate.toISOString(), now.toISOString()),
		) as boolean;
	} catch {
		return false;
	}
}

export function getCardAgeInDaysRust(
	card: ModernFSRSCard,
	now: Date = new Date(),
): number {
	try {
		const cardJson = JSON.stringify(card);
		const ageJson = wasm.get_card_age_days(cardJson, now.toISOString());
		return JSON.parse(ageJson) as number;
	} catch {
		return 0;
	}
}
