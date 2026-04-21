// Функции работы с датами для WASM модуля FSRS

import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/** Рассчитывает время просрочки карточки в часах через WASM */
export function getOverdueHours(dueDate: Date, now: Date = new Date()): number {
    try {
        return JSON.parse(
            wasm.get_overdue_hours(dueDate.toISOString(), now.toISOString()),
        ) as number;
    } catch {
        return 0;
    }
}

/** Рассчитывает оставшееся время до повторения карточки в часах через WASM
 *  Возвращает отрицательное значение если карточка просрочена
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

/** Проверяет, просрочена ли карточка через WASM */
export function isCardOverdue(dueDate: Date, now: Date = new Date()): boolean {
    try {
        return JSON.parse(
            wasm.is_card_overdue(dueDate.toISOString(), now.toISOString()),
        ) as boolean;
    } catch {
        return false;
    }
}
