/**
 * Утилиты для форматирования даты и времени с учётом глобальных настроек Obsidian
 */

import type { App } from "obsidian";

/**
 * Форматирует дату и время с учётом глобальных настроек Obsidian
 * @param app - экземпляр приложения Obsidian
 * @param date - дата для форматирования
 * @returns строка в формате, заданном пользователем (по умолчанию "YYYY-MM-DD HH:mm")
 */
export function formatDateTime(app: App, date: Date): string {
    try {
        const dateFormat =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            ((app.vault as any).getConfig("dateFormat") as string) ||
            "YYYY-MM-DD";
        const timeFormat =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            ((app.vault as any).getConfig("timeFormat") as string) || "HH:mm";
        return window.moment(date).format(`${dateFormat} ${timeFormat}`);
    } catch (error) {
        console.error("Ошибка форматирования даты и времени:", error);
        return window.moment(date).format("YYYY-MM-DD HH:mm");
    }
}

/**
 * Форматирует только дату с учётом глобальных настроек Obsidian
 * @param app - экземпляр приложения Obsidian
 * @param date - дата для форматирования
 * @returns строка с датой в формате, заданном пользователем (по умолчанию "YYYY-MM-DD")
 */
export function formatDate(app: App, date: Date): string {
    try {
        const dateFormat =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            ((app.vault as any).getConfig("dateFormat") as string) ||
            "YYYY-MM-DD";
        return window.moment(date).format(dateFormat);
    } catch (error) {
        console.error("Ошибка форматирования даты:", error);
        return window.moment(date).format("YYYY-MM-DD");
    }
}
