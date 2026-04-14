// Функции сортировки и фильтрации карточек FSRS

import type {
	ModernFSRSCard,
	FSRSSettings,
	ComputedCardState,
} from "../../interfaces/fsrs";
import { computeCardState, isCardDue } from "./fsrs-wasm";

/**
 * Сортирует карточки по приоритету (просроченные -> более низкая извлекаемость)
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
			const isDueResult = await isCardDue(card, settings, now);
			if (isDueResult) {
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
 * Рассчитывает оценку приоритета для карточки
 */
export async function calculateCardPriorityScore(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<number> {
	try {
		const computedState = await computeCardState(card, settings, now);
		const dueDate = new Date(computedState.due).getTime();
		const retrievability = computedState.retrievability;

		// Приоритет: сначала просроченные, затем по извлекаемости (меньше = выше приоритет)
		const priority = dueDate <= now.getTime() ? 0 : 1;
		return priority * 1000000 + (1 - retrievability) * 1000;
	} catch (error) {
		console.error(
			`Ошибка при вычислении приоритета для карточки ${card.filePath}:`,
			error,
		);
		return 9999999;
	}
}

/**
 * Группирует карточки по состоянию (просроченные, готовые к повторению, новые)
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
	const overdue: ModernFSRSCard[] = [];
	const due: ModernFSRSCard[] = [];
	const notDue: ModernFSRSCard[] = [];

	for (const card of cards) {
		try {
			const computedState = await computeCardState(card, settings, now);
			const dueDate = new Date(computedState.due);

			if (dueDate <= now) {
				overdue.push(card);
			} else if (
				computedState.state === "New" ||
				computedState.state === "Review"
			) {
				due.push(card);
			} else {
				notDue.push(card);
			}
		} catch (error) {
			console.error(
				`Ошибка при группировке карточки ${card.filePath}:`,
				error,
			);
			// По умолчанию добавляем в просроченные для безопасности
			overdue.push(card);
		}
	}

	return { overdue, due, notDue };
}
