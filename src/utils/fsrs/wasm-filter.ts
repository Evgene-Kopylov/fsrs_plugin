// Функции фильтрации и сортировки карточек для WASM модуля FSRS

import type { ModernFSRSCard, FSRSSettings } from "../../interfaces/fsrs";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/** Фильтрует карточки для повторения через WASM */
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

/** Сортирует карточки по приоритету через WASM */
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

/** Группирует карточки по состоянию через WASM */
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
