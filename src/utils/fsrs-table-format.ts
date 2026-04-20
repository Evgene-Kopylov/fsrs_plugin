import type { ModernFSRSCard, ComputedCardState } from "../interfaces/fsrs";
import type { App } from "obsidian";
import { formatDateTime } from "./date-format";

/**
 * Форматирует просрочку в читаемый вид
 * @param overdueHours Просрочка в часах
 * @returns Отформатированная строка
 */
export function formatOverdue(overdueHours: number): string {
    if (overdueHours <= 0) {
        return "—";
    }
    if (overdueHours < 1) {
        const minutes = Math.round(overdueHours * 60);
        return `${minutes}м`;
    }
    if (overdueHours < 24) {
        const hours = Math.round(overdueHours * 10) / 10;
        return `${hours}ч`;
    }
    const days = Math.round((overdueHours / 24) * 10) / 10;
    return `${days}д`;
}

/**
 * Извлекает отображаемое имя файла из пути
 * @param filePath Полный путь к файлу
 * @returns Короткое имя файла для отображения
 */
export function extractDisplayName(filePath: string): string {
    // Удаляем расширение .md если есть
    const withoutExt = filePath.replace(/\.md$/, "");
    // Берем только имя файла (последнюю часть пути)
    const parts = withoutExt.split(/[\\/]/);
    return parts[parts.length - 1] || filePath;
}

/**
 * Переводит состояние карточки на русский язык
 * @param state Английское название состояния
 * @returns Русский перевод
 */
export function translateState(state: string): string {
    const translations: Record<string, string> = {
        New: "Новая",
        Learning: "Изучение",
        Review: "Повторение",
        Relearning: "Переучивание",
        due: "Повторить",
    };
    return translations[state] || state;
}

/**
 * Форматирует значение поля для отображения в таблице
 * @param field Идентификатор поля
 * @param card Карточка FSRS
 * @param state Вычисленное состояние карточки
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns Отформатированное значение для отображения
 */
export function formatFieldValue(
    field: string,
    card: ModernFSRSCard,
    state: ComputedCardState,
    app: App,
    now: Date = new Date(),
): string {
    switch (field) {
        case "file":
            return extractDisplayName(card.filePath);
        case "reps":
            return String(state.reps);
        case "overdue":
            return formatOverdue(state.overdue ?? 0);
        case "stability":
            return state.stability.toFixed(1);
        case "difficulty":
            return state.difficulty.toFixed(1);
        case "retrievability":
            return state.retrievability.toFixed(1);
        case "due":
            return formatDateTime(app, new Date(state.due));
        case "state":
            return translateState(state.state);
        case "elapsed":
            return String(state.elapsed_days);
        case "scheduled":
            return String(state.scheduled_days);
        default:
            console.warn(`Неизвестное поле: ${field}`);
            return "";
    }
}

/**
 * Создает блок fsrs-table по умолчанию для вставки в файл
 * @returns Текст для вставки в блок
 */
export function createDefaultTableBlock(): string {
    return `\`\`\`fsrs-table
SELECT file, reps, overdue, state, due
LIMIT 20
\`\`\``;
}

/**
 * Форматирует сообщение об ошибке в стиле Dataview
 * @param errorMessage Сообщение об ошибке
 * @returns Отформатированное сообщение об ошибке
 */
export function formatError(errorMessage: string): string {
    const MAX_ERROR_MESSAGE_LENGTH = 500;
    // Ограничиваем длину сообщения об ошибке
    const truncatedMessage =
        errorMessage.length > MAX_ERROR_MESSAGE_LENGTH
            ? errorMessage.substring(0, MAX_ERROR_MESSAGE_LENGTH) +
              "... [truncated]"
            : errorMessage;

    return `FSRS: Error:\n-- PARSING FAILED --------------------------------------------------\n\n${truncatedMessage}\n`;
}
