/**
 * Утилиты для логирования с поддержкой настройки verbose_logging
 *
 * Флаг verbose_logging управляет выводом отладочных логов с эмодзи (⏱️, ✅ и т.д.)
 * которые видны пользователю в консоли Obsidian.
 *
 * Использование:
 *   import { verboseLog, debug, error, warn, setVerboseLoggingEnabled } from "./logger";
 *
 *   // Логи с эмодзи, видимые только при verbose_logging=true
 *   verboseLog(`⏱️ Загрузка таблицы FSRS: ${elapsedSec.toFixed(2)} с`);
 *
 *   // Отладочные логи (не видны пользователю по умолчанию в Obsidian)
 *   debug("Отладочное сообщение");
 *
 *   // Ошибки и предупреждения (всегда видны)
 *   error("Критическая ошибка");
 *   warn("Предупреждение");
 */

let verboseLoggingEnabled = false;

/**
 * Устанавливает состояние подробного логирования
 */
export function setVerboseLoggingEnabled(enabled: boolean): void {
    verboseLoggingEnabled = enabled;
}

/**
 * Проверяет, включён ли режим подробного логирования
 */
export function isVerboseLoggingEnabled(): boolean {
    return verboseLoggingEnabled;
}

/**
 * Выводит логи только при включённой настройке verbose_logging
 * Используется для сообщений с эмодзи, которые видны пользователю
 */
export function verboseLog(...args: unknown[]): void {
    if (isVerboseLoggingEnabled()) {
        // eslint-disable-next-line no-console -- log level is toggled in settings
        console.log(...args);
    }
}

/**
 * Алиас для console.debug
 * Эти логи по умолчанию не видны пользователю в Obsidian
 */
export function debug(...args: unknown[]): void {
    console.debug(...args);
}

/**
 * Алиас для console.error
 * Критические ошибки всегда логируются
 */
export function error(...args: unknown[]): void {
    console.error(...args);
}

/**
 * Алиас для console.warn
 * Предупреждения всегда логируются
 */
export function warn(...args: unknown[]): void {
    console.warn(...args);
}
