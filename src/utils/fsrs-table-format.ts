/**
 * Модуль для форматирования значений блока fsrs-table
 * Форматирует значения полей для отображения в таблице
 */

import type { App } from "obsidian";
import type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSState,
} from "../interfaces/fsrs";

import { formatDateTime } from "./date-format";

/**
 * Форматирует просрочку
 * @param diffDays Разница в днях (положительная - до повторения, отрицательная - просрочка)
 * @returns Форматированная строка
 */
export function formatOverdue(diffDays: number): string {
	if (typeof diffDays !== "number" || isNaN(diffDays)) {
		return "0.00";
	}

	// Показываем сырое значение для дебага
	return `${diffDays.toFixed(2)}`;
}

/**
 * Извлекает имя файла из пути для отображения
 * @param filePath Путь к файлу
 * @returns Отображаемое имя файла
 */
export function extractDisplayName(filePath: string): string {
	const parts = filePath.split("/");
	const fileName = parts[parts.length - 1] || filePath;
	return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}

/**
 * Переводит состояние карточки на русский язык
 */
export function translateState(state: FSRSState): string {
	const translations: Record<FSRSState, string> = {
		New: "Новая",
		Learning: "Изучение",
		Review: "Повторение",
		Relearning: "Переизучение",
	};
	return translations[state] || state;
}

/**
 * Форматирует значение поля для отображения в таблице
 * @param field Идентификатор поля
 * @param card Карточка
 * @param state Вычисленное состояние карточки
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns Форматированное значение
 */
export function formatFieldValue(
	field: string,
	card: ModernFSRSCard,
	state: ComputedCardState,
	app: App,
	now: Date,
): string {
	switch (field) {
		case "file":
			return extractDisplayName(card.filePath);

		case "reps":
			return card.reviews.length.toString();

		case "overdue": {
			// Используем предвычисленное значение просрочки из состояния
			const overdue = state.overdue ?? 0;
			return formatOverdue(overdue);
		}

		case "stability":
			return state.stability.toFixed(2);

		case "difficulty":
			return state.difficulty.toFixed(2);

		case "retrievability":
			return `${(state.retrievability * 100).toFixed(1)}%`;

		case "due":
			return formatDateTime(app, new Date(state.due));

		case "state":
			return translateState(state.state);

		case "elapsed":
			return state.elapsed_days.toFixed(0);

		case "scheduled":
			return state.scheduled_days.toFixed(0);

		default:
			return "";
	}
}

/**
 * Создает текст блока fsrs-table с параметрами по умолчанию
 * @returns Текст для вставки в блок
 */
export function createDefaultTableBlock(): string {
	return `\`\`\`fsrs-table
SELECT file as "Файл", reps as "Повторений", overdue as "Просрочка", state as "Состояние", due as "Следующее повторение"
LIMIT 20
\`\`\``;
}
