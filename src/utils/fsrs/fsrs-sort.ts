// Функции сортировки и фильтрации карточек FSRS
// Используем оптимизированные WASM реализации

import type { ModernFSRSCard, FSRSSettings } from "../../interfaces/fsrs";
import {
	filterCardsForReview as wasmFilterCardsForReview,
	sortCardsByPriority as wasmSortCardsByPriority,
	groupCardsByState as wasmGroupCardsByState,
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
	return wasmSortCardsByPriority(cards, settings, now);
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
	return wasmFilterCardsForReview(cards, settings, now);
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
	return wasmGroupCardsByState(cards, settings, now);
}
