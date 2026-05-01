import type { ModernFSRSCard, ComputedCardState } from "../interfaces/fsrs";
import type { App } from "obsidian";
import { formatDateTime } from "./date-format";
import { i18n } from "./i18n";

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
    const lastName = parts[parts.length - 1] || "";
    return lastName;
}

/**
 * Переводит состояние карточки на выбранный язык
 * @param state Название состояния
 * @returns Перевод состояния
 */
export function translateState(state: string): string {
    return i18n.t(`table.states.${state}`, { defaultValue: state });
}

/**
 * Форматирует дату по спецификаторам (%Y, %m, %d, %H, %M)
 * Входная строка ожидается в формате "YYYY-MM-DD_HH:MM" (Obsidian)
 * @param dateStr Строка даты в Obsidian-формате
 * @param format Строка формата со спецификаторами
 * @returns Отформатированная дата
 */
export function formatDateWithSpecifiers(
    dateStr: string,
    format: string,
): string {
    // Парсим ISO 8601 (2025-03-07T14:30:00.000Z) или Obsidian (2025-03-07_14:30)
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})[T_](\d{2}):(\d{2})/);
    if (!match) {
        return dateStr; // не удалось распарсить — возвращаем как есть
    }

    const year = match[1]!;
    const month = match[2]!;
    const day = match[3]!;
    const hour = match[4]!;
    const minute = match[5]!;

    let result = format;
    result = result.replace(/%Y/g, year);
    result = result.replace(/%m/g, month);
    result = result.replace(/%d/g, day);
    result = result.replace(/%H/g, hour);
    result = result.replace(/%M/g, minute);

    return result;
}

/**
 * Форматирует значение поля для отображения в таблице
 * @param field Идентификатор поля
 * @param card Карточка FSRS
 * @param state Вычисленное состояние карточки
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @param dateFormat Формат даты из date_format() (опционально)
 * @returns Отформатированное значение для отображения
 */
export function formatFieldValue(
    field: string,
    card: ModernFSRSCard,
    state: ComputedCardState,
    app: App,
    _now: Date = new Date(),
    dateFormat?: string,
): string {
    switch (field) {
        case "file":
            return extractDisplayName(card.filePath);
        case "reps":
            return String(state.reps);
        case "stability":
            return state.stability.toFixed(1);
        case "difficulty":
            return state.difficulty.toFixed(1);
        case "retrievability":
            return `${(state.retrievability * 100).toFixed(1)}%`;
        case "due":
            if (dateFormat) {
                return formatDateWithSpecifiers(state.due, dateFormat);
            }
            return formatDateTime(app, new Date(state.due));
        case "state":
            return translateState(state.state);
        case "elapsed":
            return String(state.elapsed_days);
        case "scheduled":
            if (dateFormat) {
                return formatDateWithSpecifiers(
                    String(state.scheduled_days),
                    dateFormat,
                );
            }
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
SELECT file, reps, state, due
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

    return i18n.t("table.error_prefix") + truncatedMessage + "\n";
}
