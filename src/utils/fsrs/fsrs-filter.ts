// Модуль для фильтрации файлов FSRS плагина
// Оптимизирует производительность путем исключения служебных файлов и папок

import type { FsrsPluginSettings } from "../../settings";

// Паттерны игнорирования файлов и папок по умолчанию (без .obsidian/ — передаётся через configDir)
export const DEFAULT_IGNORE_PATTERNS = [
    "templates/",
    "attachments/",
    "media/",
    "images/",
    "_trash/",
    ".trash/",
    "logs/",
    "*.canvas",
    "*.excalidraw.md",
];

/**
 * Проверяет, следует ли игнорировать файл на основе паттернов
 * @param filePath Путь к файлу для проверки
 * @param defaultPatterns Массив паттернов игнорирования по умолчанию
 * @param userPatterns Массив пользовательских паттернов игнорирования
 * @returns true если файл должен быть проигнорирован
 */
export function shouldIgnoreFile(
    filePath: string,
    defaultPatterns: string[],
    userPatterns: string[],
): boolean {
    // Объединяем дефолтные паттерны и пользовательские паттерны
    const allPatterns = [...defaultPatterns, ...userPatterns];

    for (const pattern of allPatterns) {
        const trimmedPattern = pattern.trim();
        if (trimmedPattern === "") continue;

        // Паттерн для расширения файла (начинается с *.) — самый быстрый (endsWith)
        if (trimmedPattern.startsWith("*.")) {
            const extension = trimmedPattern.substring(1); // удаляем *
            if (filePath.endsWith(extension)) {
                return true;
            }
        }
        // Паттерн для папки (заканчивается на /)
        else if (trimmedPattern.endsWith("/")) {
            // Сначала startsWith — быстрее для корневых папок (templates/file.md),
            // затем includes — для вложенных (subdir/templates/file.md)
            if (
                filePath.startsWith(trimmedPattern) ||
                filePath.includes(trimmedPattern)
            ) {
                return true;
            }
        }
        // Точное совпадение имени файла
        else if (
            filePath === trimmedPattern ||
            filePath.endsWith("/" + trimmedPattern)
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Проверяет, следует ли игнорировать файл на основе настроек плагина
 * @param filePath Путь к файлу для проверки
 * @param settings Настройки плагина
 * @returns true если файл должен быть проигнорирован
 */
export function shouldIgnoreFileWithSettings(
    filePath: string,
    settings: FsrsPluginSettings,
    configDir: string,
): boolean {
    return shouldIgnoreFile(
        filePath,
        [`${configDir}/`, ...DEFAULT_IGNORE_PATTERNS],
        settings.ignore_patterns,
    );
}

/**
 * Форматирует паттерны игнорирования для отображения в настройках
 * @param patterns Массив паттернов
 * @returns Строка с паттернами (по одному на строку)
 */
export function formatIgnorePatterns(patterns: string[]): string {
    return patterns.filter((p) => p.trim() !== "").join("\n");
}

/**
 * Парсит строку с паттернами (по одному на строку) в массив
 * @param patternsString Строка с паттернами
 * @returns Массив паттернов
 */
export function parseIgnorePatterns(patternsString: string): string[] {
    return patternsString
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p !== "");
}
