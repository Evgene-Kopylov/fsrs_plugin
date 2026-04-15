// Фронтматтер утилиты для оптимизации парсинга FSRS

/**
 * Извлекает содержимое frontmatter из markdown файла.
 * @param content Содержимое markdown файла
 * @returns Содержимое frontmatter (без разделителей ---) или null, если frontmatter не найден
 */
export function extractFrontmatter(content: string): string | null {
	// Регулярное выражение для поиска frontmatter между ---
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
 * Быстрая проверка наличия поля FSRS в содержимом файла.
 * Проверяет наличие поля 'reviews' без полного парсинга frontmatter.
 * @param content Содержимое markdown файла
 * @returns true, если файл содержит поле 'reviews' в frontmatter
 */
export function hasFsrsFields(content: string): boolean {
	// Сначала проверяем наличие frontmatter
	const frontmatter = extractFrontmatter(content);
	if (!frontmatter) {
		return false;
	}

	// Затем проверяем наличие поля reviews в frontmatter
	return hasFsrsFieldsInFrontmatter(frontmatter);
}

/**
 * Проверяет наличие поля FSRS в извлеченном frontmatter.
 * @param frontmatter Извлеченный frontmatter (без разделителей ---)
 * @returns true, если frontmatter содержит поле 'reviews'
 */
export function hasFsrsFieldsInFrontmatter(frontmatter: string): boolean {
	// Проверяем наличие поля reviews (без учета регистра)
	// Поле должно быть на верхнем уровне, не вложенное
	// Используем мультистрочный режим с флагом 'm' для поиска по всему frontmatter
	return /^reviews\s*:/im.test(frontmatter);
}

/**
 * Комбинированная проверка: определяет, нужно ли обрабатывать файл для извлечения FSRS карточки.
 * Оптимизирована для быстрого пропуска файлов без признаков FSRS.
 * @param content Содержимое markdown файла
 * @returns true, если файл содержит frontmatter с полем 'reviews'
 */
export function shouldProcessFile(content: string): boolean {
	// Быстрая проверка: если в файле нет строки 'reviews:', можно сразу пропустить
	// Это дешевая проверка перед более дорогим extractFrontmatter
	if (!/reviews\s*:/i.test(content)) {
		return false;
	}

	// Теперь извлекаем frontmatter и проверяем более точно
	const frontmatter = extractFrontmatter(content);
	if (!frontmatter) {
		return false;
	}

	// Точная проверка: поле reviews должно быть на верхнем уровне frontmatter
	return hasFsrsFieldsInFrontmatter(frontmatter);
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
		return createFrontmatter(newYamlContent) + "\n\n" + content;
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

/**
 * Извлекает все поля из frontmatter в виде простого объекта.
 * Это упрощенный парсер для быстрого извлечения значений без полного YAML парсинга.
 * @param frontmatter Извлеченный frontmatter (без разделителей ---)
 * @returns Объект с парами ключ-значение (значения как строки)
 */
export function extractSimpleFields(
	frontmatter: string,
): Record<string, string> {
	const result: Record<string, string> = {};
	const lines = frontmatter.split("\n");

	for (const line of lines) {
		const trimmed = line.trim();

		// Пропускаем пустые строки и комментарии
		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}

		// Ищем пары ключ: значение
		const colonIndex = trimmed.indexOf(":");
		if (colonIndex > 0) {
			const key = trimmed.substring(0, colonIndex).trim();
			const value = trimmed.substring(colonIndex + 1).trim();

			// Удаляем кавычки вокруг значения
			const cleanValue = value.replace(/^['"]|['"]$/g, "");
			result[key] = cleanValue;
		}
	}

	return result;
}

/**
 * Получает значение конкретного поля из frontmatter.
 * @param frontmatter Извлеченный frontmatter (без разделителей ---)
 * @param fieldName Имя поля для извлечения
 * @returns Значение поля или null, если поле не найдено
 */
export function getFieldFromFrontmatter(
	frontmatter: string,
	fieldName: string,
): string | null {
	const fields = extractSimpleFields(frontmatter);
	return fields[fieldName] || null;
}

/**
 * Проверяет, содержит ли frontmatter хотя бы одно из указанных полей.
 * @param frontmatter Извлеченный frontmatter (без разделителей ---)
 * @param fieldNames Массив имен полей для проверки
 * @returns true, если frontmatter содержит хотя бы одно из указанных полей
 */
export function hasAnyFieldInFrontmatter(
	frontmatter: string,
	fieldNames: string[],
): boolean {
	for (const fieldName of fieldNames) {
		if (new RegExp(`^${fieldName}\\s*:`, "im").test(frontmatter)) {
			return true;
		}
	}
	return false;
}
