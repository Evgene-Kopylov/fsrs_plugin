/**
 * Модуль для фильтрации и сортировки карточек блока fsrs-table
 * Реализует логику для режимов due и all
 */

import type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
} from "../interfaces/fsrs";
import type { TableMode } from "./fsrs-table-params";
import { computeCardState, isCardDue } from "./fsrs/fsrs-wasm";

/**
 * Результат фильтрации и сортировки карточек с состояниями
 */
export interface CardWithState {
	card: ModernFSRSCard;
	state: ComputedCardState;
}

/**
 * Фильтрует и сортирует карточки в соответствии с режимом
 * @param cards Массив карточек
 * @param settings Настройки плагина
 * @param mode Режим отображения
 * @param now Текущее время
 * @returns Отфильтрованный и отсортированный массив карточек с состояниями
 */
export async function filterAndSortCards(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	mode: TableMode,
	now: Date = new Date(),
): Promise<CardWithState[]> {
	if (!cards || cards.length === 0) {
		return [];
	}

	// Вычисляем состояния для всех карточек
	const cardsWithState = await computeCardsStates(cards, settings, now);

	// Разделяем карточки на due (просроченные) и scheduled (запланированные)
	const dueCards: CardWithState[] = [];
	const scheduledCards: CardWithState[] = [];

	for (const item of cardsWithState) {
		const isDue = await isCardDue(item.card, settings, now);
		if (isDue) {
			dueCards.push(item);
		} else {
			scheduledCards.push(item);
		}
	}

	// Сортировка в зависимости от режима
	if (mode === "due") {
		// Сортируем due карточки по приоритету (возрастание retrievability)
		return sortCardsForDue(dueCards, now);
	} else {
		// mode === "all"
		// Сначала due (сортировка как в due), затем scheduled карточки (сортировка по дате due)
		const sortedDueCards = sortCardsForDue(dueCards, now);
		const sortedScheduledCards = sortScheduledCards(scheduledCards);
		return [...sortedDueCards, ...sortedScheduledCards];
	}
}

/**
 * Вычисляет состояния для массива карточек
 * @param cards Массив карточек
 * @param settings Настройки плагина
 * @param now Текущее время
 * @returns Массив карточек с вычисленными состояниями
 */
async function computeCardsStates(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date,
): Promise<CardWithState[]> {
	const cardsWithState: CardWithState[] = [];

	for (const card of cards) {
		// Валидация карточки перед вычислением состояния
		if (!card || typeof card !== "object") {
			console.warn(`Пропускаем некорректную карточку: ${String(card)}`);
			continue;
		}

		if (!Array.isArray(card.reviews)) {
			console.warn(
				`Пропускаем карточку ${card.filePath}: reviews не является массивом`,
			);
			continue;
		}

		// Проверяем, есть ли хотя бы одна валидная сессия
		let hasValidSession = false;
		for (const review of card.reviews) {
			if (
				review &&
				typeof review === "object" &&
				review.date &&
				review.rating &&
				typeof review.stability === "number" &&
				typeof review.difficulty === "number"
			) {
				hasValidSession = true;
				break;
			}
		}

		if (!hasValidSession && card.reviews.length > 0) {
			console.warn(
				`Пропускаем карточку ${card.filePath}: нет валидных сессий повторения`,
			);
			continue;
		}

		try {
			const state = await computeCardState(card, settings, now);
			cardsWithState.push({ card, state });
		} catch (error) {
			console.error(
				`Ошибка вычисления состояния для ${card.filePath}:`,
				error,
			);
			// Вместо создания дефолтного состояния пропускаем карточку
			// чтобы избежать некорректных данных в таблице
			console.warn(
				`Пропускаем карточку ${card.filePath} из-за ошибки вычисления состояния`,
			);
		}
	}

	return cardsWithState;
}

/**
 * Сортирует due карточки по приоритету (по возрастанию retrievability)
 */
function sortCardsForDue(cards: CardWithState[], now: Date): CardWithState[] {
	// Создаем временный массив для сортировки
	const cardsForSorting = cards.map((item) => ({
		...item,
		priorityScore: calculatePriorityScore(item.state, now),
	}));

	// Сортируем по возрастанию приоритета (чем ниже retrievability, тем выше приоритет)
	cardsForSorting.sort((a, b) => a.priorityScore - b.priorityScore);

	return cardsForSorting.map(({ card, state }) => ({ card, state }));
}

/**
 * Сортирует scheduled карточки по дате due (возрастание)
 */
function sortScheduledCards(cards: CardWithState[]): CardWithState[] {
	return cards.slice().sort((a, b) => {
		const aTime = new Date(a.state.due).getTime();
		const bTime = new Date(b.state.due).getTime();
		return aTime - bTime;
	});
}

/**
 * Рассчитывает приоритет для сортировки due карточек
 * Чем ниже retrievability, тем выше приоритет
 * Просроченные карточки получают дополнительный приоритет
 */
function calculatePriorityScore(state: ComputedCardState, now: Date): number {
	// Приоритет = retrievability (0-1), где 0 = высший приоритет
	// Для просроченных карточек добавляем бонус к приоритету
	const dueDate = new Date(state.due);
	const isOverdue = dueDate.getTime() < now.getTime();

	let priority = state.retrievability;
	if (isOverdue) {
		// Просроченные карточки получают бонус к приоритету
		priority -= 0.5; // Уменьшаем retrievability для увеличения приоритета
	}

	return Math.max(0, priority);
}
