// Модуль для фильтрации файлов FSRS плагина
// Оптимизирует производительность путем исключения служебных файлов и папок

import type { MyPluginSettings } from "../../settings";

// Паттерны игнорирования файлов и папок по умолчанию
export const DEFAULT_IGNORE_PATTERNS = [
	// eslint-disable-next-line obsidianmd/hardcoded-config-path
	".obsidian/",
	"templates/",
	"attachments/",
	"media/",
	"images/",
	"_trash/",
	".trash/",
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

		// Паттерн для папки (заканчивается на /)
		if (trimmedPattern.endsWith("/")) {
			// Проверяем, содержит ли путь эту папку (включая вложенные пути)
			if (filePath.includes(trimmedPattern)) {
				return true;
			}
		}
		// Паттерн для расширения файла (начинается с *.)
		else if (trimmedPattern.startsWith("*.")) {
			const extension = trimmedPattern.substring(1); // удаляем *
			if (filePath.endsWith(extension)) {
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
	settings: MyPluginSettings,
): boolean {
	return shouldIgnoreFile(
		filePath,
		DEFAULT_IGNORE_PATTERNS,
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

/**
 * Получает все активные паттерны игнорирования (дефолтные + пользовательские)
 * @param settings Настройки плагина
 * @returns Массив всех активных паттернов
 */
export function getAllIgnorePatterns(settings: MyPluginSettings): string[] {
	return [...DEFAULT_IGNORE_PATTERNS, ...settings.ignore_patterns];
}
