// Вспомогательные функции для работы со временем

import type { ModernFSRSCard } from "../../interfaces/fsrs";
import type { App } from "obsidian";
import { formatDate } from "../date-format";

/**
 * Форматирует дату в локальное строковое представление
 * @param date - дата для форматирования
 * @param app - необязательный экземпляр приложения Obsidian для форматирования с учетом настроек
 */
export function formatLocalDate(date: Date, app?: App): string {
    if (app) {
        return formatDate(app, date);
    }
    return date.toLocaleString();
}

/**
 * Рассчитывает количество минут с последнего повторения карточки
 * Возвращает Infinity, если повторений еще не было
 */
export function getMinutesSinceLastReview(
    card: ModernFSRSCard,
    now: Date = new Date(),
): number {
    if (card.reviews.length === 0) {
        return Infinity; // Карточка еще не повторялась
    }

    const lastReviewDate = new Date(
        card.reviews[card.reviews.length - 1]!.date,
    );
    const diffMs = now.getTime() - lastReviewDate.getTime();
    return Math.floor(diffMs / (1000 * 60));
}
