// Вспомогательные функции для работы со временем

import type { ModernFSRSCard, ComputedCardState } from "../../interfaces/fsrs";
import type { App } from "obsidian";
import { formatDate } from "../date-format";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/**
 * Рассчитывает время просрочки карточки в часах
 */
export function getOverdueHours(dueDate: Date, now: Date = new Date()): number {
    try {
        return JSON.parse(
            wasm.get_overdue_hours(dueDate.toISOString(), now.toISOString()),
        ) as number;
    } catch {
        return 0;
    }
}

/**
 * Форматирует время просрочки в читаемый вид
 */
export function formatOverdueTime(hours: number): string {
    if (hours <= 0) return "по графику";

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    const parts: string[] = [];
    if (days > 0) {
        parts.push(`${days} ${getRussianNoun(days, "день", "дня", "дней")}`);
    }
    if (remainingHours > 0) {
        parts.push(
            `${remainingHours} ${getRussianNoun(remainingHours, "час", "часа", "часов")}`,
        );
    }

    return parts.join(" ");
}

/**
 * Вспомогательная функция для склонения русских существительных
 */
export function getRussianNoun(
    number: number,
    one: string,
    two: string,
    five: string,
): string {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;

    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
}

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
 * Проверяет, просрочена ли карточка
 */
export function isCardOverdue(dueDate: Date, now: Date = new Date()): boolean {
    try {
        return JSON.parse(
            wasm.is_card_overdue(dueDate.toISOString(), now.toISOString()),
        ) as boolean;
    } catch {
        return false;
    }
}

/**
 * Рассчитывает оставшееся время до повторения карточки в часах
 * Возвращает отрицательное значение если карточка просрочена
 */
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

/**
 * Форматирует оставшееся время до повторения
 */
export function formatTimeUntilDue(
    dueDate: Date,
    now: Date = new Date(),
): string {
    const hours = getHoursUntilDue(dueDate, now);

    if (hours > 0) {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        const parts: string[] = [];
        if (days > 0) {
            parts.push(
                `${days} ${getRussianNoun(days, "день", "дня", "дней")}`,
            );
        }
        if (remainingHours > 0) {
            parts.push(
                `${remainingHours} ${getRussianNoun(remainingHours, "час", "часа", "часов")}`,
            );
        }

        return parts.length > 0 ? `через ${parts.join(" ")}` : "менее часа";
    } else if (hours === 0) {
        return "сейчас";
    } else {
        // Просрочено
        return formatOverdueTime(-hours);
    }
}

/**
 * Создает удобное для чтения описание состояния карточки
 */
export function describeCardState(
    computedState: ComputedCardState,
    now: Date = new Date(),
): string {
    const dueDate = new Date(computedState.due);
    const overdueHours = computedState.overdue ?? getOverdueHours(dueDate, now);

    if (overdueHours > 0) {
        return `Просрочена: ${formatOverdueTime(overdueHours)}`;
    } else if (overdueHours === 0) {
        return "Сейчас";
    } else {
        return `Следующее повторение: ${formatTimeUntilDue(dueDate, now)}`;
    }
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
