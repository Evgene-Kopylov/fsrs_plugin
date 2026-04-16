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
import type { TableMode } from "./fsrs-table-params";
import { formatDateTime } from "./date-format";

/**
 * Форматирует просрочку в зависимости от режима
 * @param diffDays Разница в днях (положительная - до повторения, отрицательная - просрочка)
 * @param mode Режим отображения
 * @returns Форматированная строка
 */
export function formatOverdueForMode(
	diffDays: number,
	mode: TableMode,
): string {
	if (typeof diffDays !== "number" || isNaN(diffDays)) {
		return "0 дн";
	}

	// Для режима "due" показываем только отрицательные значения или 0
	if (mode === "due") {
		if (diffDays > 0) {
			return "0 дн";
		}
		const absDays = Math.abs(diffDays);
		if (absDays < 1) {
			const hours = Math.round(absDays * 24);
			return `-${hours} ч`;
		}
		return `-${Math.round(absDays)} дн`;
	}

	// Для режима "future" показываем только положительные значения или 0
	if (mode === "future") {
		if (diffDays < 0) {
			return "0 дн";
		}
		if (diffDays < 1) {
			const hours = Math.round(diffDays * 24);
			return `+${hours} ч`;
		}
		return `+${Math.round(diffDays)} дн`;
	}

	// Для режима "all" показываем со знаком
	if (diffDays < 0) {
		const absDays = Math.abs(diffDays);
		if (absDays < 1) {
			const hours = Math.round(absDays * 24);
			return `-${hours} ч`;
		}
		return `-${Math.round(absDays)} дн`;
	} else if (diffDays > 0) {
		if (diffDays < 1) {
			const hours = Math.round(diffDays * 24);
			return `+${hours} ч`;
		}
		return `+${Math.round(diffDays)} дн`;
	}

	return "0 дн";
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
 * @param mode Режим отображения
 * @returns Форматированное значение
 */
export function formatFieldValue(
	field: string,
	card: ModernFSRSCard,
	state: ComputedCardState,
	app: App,
	now: Date,
	mode: TableMode,
): string {
	switch (field) {
		case "file":
			return extractDisplayName(card.filePath);

		case "reps":
			return card.reviews.length.toString();

		case "overdue": {
			const dueDate = new Date(state.due);
			const diffMs = dueDate.getTime() - now.getTime();
			const diffDays = diffMs / (1000 * 3600 * 24);
			return formatOverdueForMode(diffDays, mode);
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
 * Создает текст блока fsrs-table с параметрами по умолчанию для режима
 * @param mode Режим отображения
 * @returns Текст для вставки в блок
 */
export function createDefaultTableBlock(mode: TableMode = "due"): string {
	let block = "```fsrs-table\n";
	block += `mode: ${mode}\n`;

	if (mode === "due") {
		block += `columns: file as "Файл", reps as "Повторений", overdue as "Просрочка", retrievability as "Извлекаемость"\n`;
	} else if (mode === "future") {
		block += `columns: file as "Файл", reps as "Повторений", due as "Следующее повторение", scheduled as "Интервал"\n`;
	} else {
		block += `columns: file as "Файл", reps as "Повторений", overdue as "Просрочка", state as "Состояние", due as "Следующее повторение"\n`;
	}

	block += `limit: 20\n`;
	block += "```";

	return block;
}
