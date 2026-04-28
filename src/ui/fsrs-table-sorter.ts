/**
 * Модуль сортировки карточек для таблицы FSRS
 * Содержит чистые функции для сортировки карточек
 */

import type { CardWithState } from "../utils/fsrs-table-filter";
import type { SortParam } from "../utils/fsrs-table-params";
import type { ModernFSRSCard } from "../interfaces/fsrs";

/**
 * Сортирует массив карточек по указанному полю и направлению
 * @param cards Массив карточек с состояниями
 * @param field Поле для сортировки
 * @param direction Направление сортировки
 * @returns Отсортированный массив
 */
export function sortCards(
    cards: CardWithState[],
    field: string,
    direction: "ASC" | "DESC",
): CardWithState[] {
    return [...cards].sort((a, b) => {
        let valueA: string | number;
        let valueB: string | number;

        // Получаем значения в зависимости от поля
        switch (field) {
            case "file":
                valueA = a.card.filePath.toLowerCase();
                valueB = b.card.filePath.toLowerCase();
                break;
            case "reps":
                valueA = a.state.reps;
                valueB = b.state.reps;
                break;
            case "overdue":
                valueA = a.state.overdue ?? 0;
                valueB = b.state.overdue ?? 0;
                break;
            case "stability":
                valueA = a.state.stability;
                valueB = b.state.stability;
                break;
            case "difficulty":
                valueA = a.state.difficulty;
                valueB = b.state.difficulty;
                break;
            case "retrievability":
                valueA = a.state.retrievability;
                valueB = b.state.retrievability;
                break;
            case "due":
                // Сравниваем строки дат лексикографически (формат YYYY-MM-DD_HH:MM)
                valueA = a.state.due;
                valueB = b.state.due;
                break;
            case "state":
                valueA = a.state.state;
                valueB = b.state.state;
                break;
            case "elapsed":
                valueA = a.state.elapsed_days;
                valueB = b.state.elapsed_days;
                break;
            case "scheduled":
                valueA = a.state.scheduled_days;
                valueB = b.state.scheduled_days;
                break;
            default: {
                // Для неизвестных полей сортируем как строки
                const valA = a.card[field as keyof ModernFSRSCard];
                valueA =
                    typeof valA === "string" || typeof valA === "number"
                        ? String(valA)
                        : "";
                const valB = b.card[field as keyof ModernFSRSCard];
                valueB =
                    typeof valB === "string" || typeof valB === "number"
                        ? String(valB)
                        : "";
                break;
            }
        }

        // Сравниваем значения
        let comparison = 0;
        if (typeof valueA === "number" && typeof valueB === "number") {
            comparison = valueA - valueB;
        } else if (
            typeof valueA === "string" &&
            typeof valueB === "string"
        ) {
            comparison = valueA.localeCompare(valueB);
        } else {
            // Смешанные типы — преобразуем к строке
            comparison = String(valueA).localeCompare(String(valueB));
        }

        // Учитываем направление сортировки
        return direction === "ASC" ? comparison : -comparison;
    });
}

/**
 * Возвращает следующее направление сортировки для поля
 * Логика: нет параметра → ASC → DESC → снять сортировку
 * @param currentSort Текущий параметр сортировки
 * @param field Поле для сортировки
 * @returns Следующее направление сортировки или null для снятия сортировки
 */
export function getNextSortDirection(
    currentSort: SortParam | undefined,
    field: string,
): "ASC" | "DESC" | null {
    if (!currentSort || currentSort.field !== field) {
        return "ASC";
    }

    // Переключаем направление: ASC → DESC → снять сортировку
    if (currentSort.direction === "ASC") {
        return "DESC";
    } else {
        // DESC → снять сортировку
        return null;
    }
}
