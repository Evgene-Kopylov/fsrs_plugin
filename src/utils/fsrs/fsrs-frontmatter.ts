// Фронтматтер утилиты для оптимизации парсинга FSRS

/**
 * Извлекает содержимое frontmatter из markdown файла.
 * @param content Содержимое markdown файла
 * @returns Содержимое frontmatter (без разделителей ---) или null, если frontmatter не найден
 */
export function extractFrontmatter(content: string): string | null {
    // Регулярное выражение для поиска frontmatter между ---
    // Frontmatter должен быть в начале файла, без предшествующего текста
    if (!content.startsWith("---")) {
        return null;
    }
    const frontmatterRegex = /^---\s*$([\s\S]*?)^---[ \t]*$/m;
    const match = frontmatterRegex.exec(content);
    return match ? match[1]! : null;
}

/**
 * Извлекает содержимое frontmatter и информацию о совпадении.
 * @param content Содержимое markdown файла
 * @returns Объект с содержимым frontmatter и информацией о совпадении, или null, если frontmatter не найден
 */
export function extractFrontmatterWithMatch(
    content: string,
): { content: string; match: RegExpExecArray } | null {
    // Регулярное выражение для поиска frontmatter между ---
    // Frontmatter должен быть в начале файла, без предшествующего текста
    if (!content.startsWith("---")) {
        return null;
    }
    const frontmatterRegex = /^---\s*$([\s\S]*?)^---[ \t]*$/m;
    const match = frontmatterRegex.exec(content);
    if (!match) {
        return null;
    }
    return {
        content: match[1]!,
        match: match,
    };
}

/**
 * Создает новый frontmatter для файла.
 * @param yamlContent Содержимое YAML (без разделителей ---)
 * @returns Полный frontmatter с разделителями
 */
export function createFrontmatter(yamlContent: string): string {
    return `---\n${yamlContent}\n---`;
}

/**
 * Обновляет или добавляет frontmatter в содержимое файла.
 * @param content Исходное содержимое файла
 * @param newYamlContent Новое содержимое YAML для frontmatter
 * @returns Обновленное содержимое файла с frontmatter
 */
export function updateFrontmatterInContent(
    content: string,
    newYamlContent: string,
): string {
    const frontmatterRegex = /^---\s*$([\s\S]*?)^---[ \t]*$/m;
    const hasExistingFrontmatter = frontmatterRegex.test(content);

    if (hasExistingFrontmatter) {
        // Заменяем существующий frontmatter
        return content.replace(
            frontmatterRegex,
            createFrontmatter(newYamlContent),
        );
    } else {
        // Добавляем новый frontmatter в начало файла
        // Если контент начинается с пробелов, добавляем только один перевод строки
        const separator = /^\s/.test(content) ? "\n" : "\n\n";
        return createFrontmatter(newYamlContent) + separator + content;
    }
}

/**
 * Удаляет frontmatter из содержимого файла.
 * @param content Содержимое файла с frontmatter
 * @returns Содержимое файла без frontmatter
 */
export function removeFrontmatterFromContent(content: string): string {
    const frontmatterRegex = /^---\s*$([\s\S]*?)^---[ \t]*$/m;
    return content.replace(frontmatterRegex, "").trimStart();
}
