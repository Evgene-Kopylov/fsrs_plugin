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
		// Fallback на стандартный формат
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

/**
 * Форматирует только время с учётом глобальных настроек Obsidian
 * @param app - экземпляр приложения Obsidian
 * @param date - дата для форматирования
 * @returns строка со временем в формате, заданном пользователем (по умолчанию "HH:mm")
 */
export function formatTime(app: App, date: Date): string {
	try {
		const timeFormat =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			((app.vault as any).getConfig("timeFormat") as string) || "HH:mm";
		return window.moment(date).format(timeFormat);
	} catch (error) {
		console.error("Ошибка форматирования времени:", error);
		return window.moment(date).format("HH:mm");
	}
}

/**
 * Возвращает текущую дату и время в формате, заданном пользователем
 * @param app - экземпляр приложения Obsidian
 * @returns строка с текущей датой и временем
 */
export function getCurrentDateTimeFormatted(app: App): string {
	return formatDateTime(app, new Date());
}

/**
 * Парсит строку даты с учётом глобальных настроек Obsidian
 * @param app - экземпляр приложения Obsidian
 * @param dateString - строка с датой для парсинга
 * @returns объект Date или null в случае ошибки
 */
export function parseFormattedDate(app: App, dateString: string): Date | null {
	try {
		const dateFormat =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			((app.vault as any).getConfig("dateFormat") as string) ||
			"YYYY-MM-DD";
		const timeFormat =
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			((app.vault as any).getConfig("timeFormat") as string) || "HH:mm";

		// Пробуем парсить с форматом даты + времени
		let momentDate = window.moment(
			dateString,
			`${dateFormat} ${timeFormat}`,
			true,
		);
		if (momentDate.isValid()) {
			return momentDate.toDate();
		}

		// Пробуем парсить только с форматом даты
		momentDate = window.moment(dateString, dateFormat, true);
		if (momentDate.isValid()) {
			return momentDate.toDate();
		}

		// Если не получилось, пробуем стандартный парсинг
		momentDate = window.moment(dateString);
		if (momentDate.isValid()) {
			return momentDate.toDate();
		}

		return null;
	} catch (error) {
		console.error("Ошибка парсинга даты:", error);
		return null;
	}
}
