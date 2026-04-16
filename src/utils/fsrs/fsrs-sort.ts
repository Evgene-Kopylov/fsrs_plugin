// Функции сортировки и фильтрации карточек FSRS
// Используем оптимизированные WASM реализации

import type { ModernFSRSCard, FSRSSettings } from "../../interfaces/fsrs";
import {
	filterCardsForReview as wasmFilterCardsForReview,
	sortCardsByPriority as wasmSortCardsByPriority,
	groupCardsByState as wasmGroupCardsByState,
	computeCardState,
} from "./fsrs-wasm";

/**
 * Сортирует карточки по приоритету (просроченные -> более низкая извлекаемость)
 * Использует оптимизированную WASM реализацию для пакетной обработки
 */
export async function sortCardsByPriority(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	if (!Array.isArray(cards)) {
		console.error("sortCardsByPriority: cards is not an array", cards);
		return [];
	}

	if (cards.length === 0) {
		return [];
	}

	try {
		return await wasmSortCardsByPriority(cards, settings, now);
	} catch (error) {
		console.error("Ошибка при сортировке карточек:", error);
		return cards; // Возвращаем оригинальный массив в случае ошибки
	}
}

/**
 * Фильтрует карточки для повторения
 * Использует оптимизированную WASM реализацию для пакетной обработки
 */
export async function filterCardsForReview(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	if (!Array.isArray(cards)) {
		console.error("filterCardsForReview: cards is not an array", cards);
		return [];
	}

	if (cards.length === 0) {
		return [];
	}

	try {
		return await wasmFilterCardsForReview(cards, settings, now);
	} catch (error) {
		console.error("Ошибка при фильтрации карточек для повторения:", error);
		return []; // Возвращаем пустой массив в случае ошибки
	}
}

/**
 * Фильтрует карточки, запланированные на будущее (не готовые к повторению сейчас)
 * Возвращает карточки, отсортированные по дате следующего повторения (от ближайших к дальним)
 */
export async function filterCardsForFuture(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<ModernFSRSCard[]> {
	if (!Array.isArray(cards)) {
		console.error("filterCardsForFuture: cards is not an array", cards);
		return [];
	}

	if (cards.length === 0) {
		return [];
	}

	// Собираем карточки с состояниями
	const cardsWithState: {
		card: ModernFSRSCard;
		state: unknown;
		dueTime: number;
	}[] = [];

	for (const card of cards) {
		if (!card || typeof card !== "object") {
			console.warn("Пропускаем некорректную карточку", card);
			continue;
		}

		try {
			const state = await computeCardState(card, settings, now);

			// Проверяем валидность состояния
			if (!state || typeof state !== "object") {
				console.warn(
					`Некорректное состояние для карточки ${card.filePath}`,
					state,
				);
				continue;
			}

			// Проверяем поле due
			if (!state.due || typeof state.due !== "string") {
				console.warn(
					`Некорректное поле due для карточки ${card.filePath}`,
					state.due,
				);
				continue;
			}

			const dueDate = new Date(state.due);
			if (isNaN(dueDate.getTime())) {
				console.warn(
					`Некорректная дата due для карточки ${card.filePath}: ${state.due}`,
				);
				continue;
			}

			const dueTime = dueDate.getTime();
			const nowTime = now.getTime();

			// Фильтруем карточки, у которых следующее повторение в будущем
			if (dueTime > nowTime) {
				cardsWithState.push({
					card,
					state,
					dueTime,
				});
			}
		} catch (error) {
			console.warn(
				`Ошибка при вычислении состояния карточки ${card.filePath}, пропускаем:`,
				error,
			);
			// Пропускаем карточку с ошибкой
			continue;
		}
	}

	// Сортируем по времени следующего повторения (от ближайших к дальним)
	cardsWithState.sort((a, b) => a.dueTime - b.dueTime);

	// Возвращаем только карточки
	return cardsWithState.map((item) => item.card);
}

/**
 * Ограничивает количество карточек для отображения
 */
export function limitCards(
	cards: ModernFSRSCard[],
	max: number = 30,
): ModernFSRSCard[] {
	if (!Array.isArray(cards)) {
		console.error("limitCards: cards is not an array", cards);
		return [];
	}

	if (cards.length === 0) {
		return [];
	}

	return cards.slice(0, Math.max(0, max));
}

/**
 * Рассчитывает оценку приоритета для карточки
 * Устаревшая функция - используйте sortCardsByPriority для пакетной обработки
 * @deprecated Используйте sortCardsByPriority для оптимальной производительности
 */
export async function calculateCardPriorityScore(
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<number> {
	// Простая реализация для обратной совместимости
	// В реальном использовании рекомендуется использовать sortCardsByPriority для пакетной обработки
	const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Завтра как дефолт
	const retrievability = 0.8; // Дефолтное значение
	const priority = dueDate.getTime() <= now.getTime() ? 0 : 1;
	return priority * 1000000 + (1 - retrievability) * 1000;
}

/**
 * Группирует карточки по состоянию (просроченные, готовые к повторению, новые)
 * Использует оптимизированную WASM реализацию для пакетной обработки
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
	if (!Array.isArray(cards)) {
		console.error("groupCardsByState: cards is not an array", cards);
		return { overdue: [], due: [], notDue: [] };
	}

	if (cards.length === 0) {
		return { overdue: [], due: [], notDue: [] };
	}

	try {
		return await wasmGroupCardsByState(cards, settings, now);
	} catch (error) {
		console.error("Ошибка при группировке карточек:", error);
		// Возвращаем дефолтную группировку: все карточки в notDue
		return { overdue: [], due: [], notDue: [...cards] };
	}
}
