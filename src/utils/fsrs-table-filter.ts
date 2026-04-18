/**
 * Модуль для фильтрации и сортировки карточек блока fsrs-table
 * Реализует логику для отображения всех карточек с поддержкой пользовательской сортировки
 */

import type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
} from "../interfaces/fsrs";
import type { SortParam, TableParams } from "./fsrs-table-params";
import { computeCardState, isCardDue } from "./fsrs/fsrs-wasm";

/**
 * Результат фильтрации и сортировки карточек с состояниями
 */
export interface CardWithState {
	card: ModernFSRSCard;
	state: ComputedCardState;
	isDue: boolean;
}

/**
 * Фильтрует и сортирует карточки в соответствии с параметрами
 * @param cards Массив карточек
 * @param settings Настройки плагина
 * @param params Параметры таблицы (сортировка и лимит)
 * @param now Текущее время
 * @returns Отфильтрованный и отсортированный массив карточек с состояниями
 */
export async function filterAndSortCards(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	params: TableParams,
	now: Date = new Date(),
): Promise<CardWithState[]> {
	if (!cards || cards.length === 0) {
		return [];
	}

	// Вычисляем состояния для всех карточек
	const cardsWithState = await computeCardsStates(cards, settings, now);

	// Применяем сортировку в зависимости от наличия пользовательских параметров
	if (params.sort) {
		// Если указана пользовательская сортировка, применяем её ко всем карточкам
		return applyCustomSort(cardsWithState, params.sort, now);
	} else {
		// Используем дефолтную логику сортировки: сначала due, затем scheduled
		return applyDefaultSort(cardsWithState, now);
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
			const isDue = await isCardDue(card, settings, now);
			cardsWithState.push({ card, state, isDue });
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
 * Применяет дефолтную логику сортировки: сначала due карточки, затем scheduled
 * @param cardsWithState Все карточки с состояниями и флагом isDue
 * @param now Текущее время
 * @returns Отсортированный массив карточек
 */
function applyDefaultSort(
	cardsWithState: CardWithState[],
	now: Date,
): CardWithState[] {
	// Разделяем карточки на due и scheduled
	const dueCards: CardWithState[] = [];
	const scheduledCards: CardWithState[] = [];

	for (const item of cardsWithState) {
		if (item.isDue) {
			dueCards.push(item);
		} else {
			scheduledCards.push(item);
		}
	}

	// Сортируем due карточки по приоритету, затем scheduled по дате due
	const sortedDueCards = sortCardsForDue(dueCards, now);
	const sortedScheduledCards = sortScheduledCards(scheduledCards);
	return [...sortedDueCards, ...sortedScheduledCards];
}

/**
 * Применяет пользовательскую сортировку ко всем карточкам
 * @param cards Все карточки с состояниями
 * @param sort Параметры сортировки
 * @param now Текущее время для вычисления overdue
 * @returns Отсортированный массив карточек
 */
function applyCustomSort(
	cards: CardWithState[],
	sort: SortParam,
	now: Date,
): CardWithState[] {
	return cards.slice().sort((a, b) => {
		const aValue: string | number | Date = getFieldValue(
			a,
			sort.field,
			now,
		);
		const bValue: string | number | Date = getFieldValue(
			b,
			sort.field,
			now,
		);

		// Определяем порядок сортировки
		let comparison = 0;

		// Сравниваем значения в зависимости от типа
		if (typeof aValue === "string" && typeof bValue === "string") {
			comparison = aValue.localeCompare(bValue);
		} else if (typeof aValue === "number" && typeof bValue === "number") {
			comparison = aValue - bValue;
		} else if (aValue instanceof Date && bValue instanceof Date) {
			comparison = aValue.getTime() - bValue.getTime();
		} else {
			// Fallback: преобразуем в строку
			const aStr = String(aValue);
			const bStr = String(bValue);
			comparison = aStr.localeCompare(bStr);
		}

		// Инвертируем для DESC
		return sort.direction === "DESC" ? -comparison : comparison;
	});
}

/**
 * Получает значение поля для сортировки
 * @param item Карточка с состоянием
 * @param field Название поля
 * @param now Текущее время для вычисления overdue
 * @returns Значение поля
 */
function getFieldValue(
	item: CardWithState,
	field: string,
	now: Date,
): string | number | Date {
	switch (field) {
		case "file":
			return item.card.filePath || "";
		case "reps":
			return item.state.reps || 0;
		case "overdue": {
			// Вычисляем дни просрочки
			const dueDate = new Date(item.state.due || 0);
			const overdueMs = now.getTime() - dueDate.getTime();
			const overdueDays = Math.max(
				0,
				Math.floor(overdueMs / (1000 * 60 * 60 * 24)),
			);
			return overdueDays;
		}
		case "stability":
			return item.state.stability || 0;
		case "difficulty":
			return item.state.difficulty || 0;
		case "retrievability":
			return item.state.retrievability || 0;
		case "due":
			return new Date(item.state.due || 0);
		case "state":
			return item.state.state || "";
		case "elapsed":
			return item.state.elapsed_days || 0;
		case "scheduled":
			return item.state.scheduled_days || 0;
		default:
			console.warn(`Неизвестное поле для сортировки: ${field}`);
			return "";
	}
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

	return cardsForSorting.map(({ card, state, isDue }) => ({
		card,
		state,
		isDue,
	}));
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
