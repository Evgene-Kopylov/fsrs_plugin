// Вспомогательные функции для работы с YAML и обновлением FSRS полей

import type { ReviewSession } from "../../interfaces/fsrs";

/**
 * Обновляет поле reviews в YAML, сохраняя все остальные поля неизменными
 * @param yaml Исходный YAML текст
 * @param reviews Обновленный массив сессий повторения
 * @returns Обновленный YAML текст
 */
export function updateReviewsInYaml(
	yaml: string,
	reviews: ReviewSession[],
): string {
	try {
		// Разделяем YAML на строки
		const lines = yaml.split("\n");
		const updatedLines: string[] = [];
		let inReviewsBlock = false;
		let reviewsStartIndex = -1;
		let indentLevel = 0;

		// Находим начало блока reviews
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			const trimmed = line.trim();

			// Проверяем, является ли строка началом блока reviews
			if (!inReviewsBlock && /^reviews\s*:/i.test(trimmed)) {
				inReviewsBlock = true;
				reviewsStartIndex = i;
				indentLevel = line.search(/\S/);
				updatedLines.push(line);
				continue;
			}

			// Если мы внутри блока reviews, пропускаем все строки
			// пока не встретим строку с меньшим или равным отступом
			if (inReviewsBlock) {
				const currentIndent = line.search(/\S/);
				if (currentIndent > indentLevel) {
					// Это дочерний элемент блока reviews, пропускаем
					continue;
				} else {
					// Вышли из блока reviews
					inReviewsBlock = false;
				}
			}

			// Добавляем все строки, не относящиеся к блоку reviews
			updatedLines.push(line);
		}

		// Если блок reviews не найден, добавляем его в конец
		if (reviewsStartIndex === -1) {
			// Находим последнюю непустую строку
			let lastContentLineIndex = -1;
			for (let i = lines.length - 1; i >= 0; i--) {
				if (lines[i]!.trim() !== "") {
					lastContentLineIndex = i;
					break;
				}
			}

			// Добавляем пустую строку перед reviews, если нужно
			if (
				lastContentLineIndex >= 0 &&
				lines[lastContentLineIndex]!.trim() !== ""
			) {
				updatedLines.push("");
			}

			// Добавляем заголовок reviews
			updatedLines.push("reviews:");
			reviewsStartIndex = updatedLines.length - 1;
		}

		// Генерируем строки для массива reviews
		const reviewsLines = generateReviewsYaml(reviews, indentLevel);

		// Вставляем обновленный блок reviews на его место
		const finalLines: string[] = [];
		for (let i = 0; i < updatedLines.length; i++) {
			finalLines.push(updatedLines[i]!);
			if (i === reviewsStartIndex) {
				// Добавляем строки массива reviews после заголовка
				finalLines.push(...reviewsLines);
			}
		}

		return finalLines.join("\n");
	} catch (error) {
		console.error("Ошибка при обновлении YAML:", error);
		// В случае ошибки возвращаем исходный YAML
		return yaml;
	}
}

/**
 * Генерирует YAML для массива reviews с правильным форматированием
 * @param reviews Массив сессий повторения
 * @param baseIndent Базовый уровень отступа (отступ для поля reviews)
 * @returns Массив строк YAML
 */
function generateReviewsYaml(
	reviews: ReviewSession[],
	baseIndent: number,
): string[] {
	const lines: string[] = [];

	if (reviews.length === 0) {
		// Пустой массив
		lines.push(" ".repeat(baseIndent + 2) + "[]");
		return lines;
	}

	// Для каждого элемента массива добавляем элемент в формате:
	// - date: "..."
	//   rating: "..."
	//   stability: ...
	//   difficulty: ...
	for (const review of reviews) {
		// Элемент массива с отступом на 2 символа больше базового
		const itemIndent = baseIndent + 2;
		lines.push(" ".repeat(itemIndent) + "-");

		// Добавляем поля с отступом на 4 символа больше базового
		const fieldIndent = baseIndent + 4;
		lines.push(
			" ".repeat(fieldIndent) + `date: ${JSON.stringify(review.date)}`,
		);
		lines.push(
			" ".repeat(fieldIndent) + `rating: ${JSON.stringify(review.rating)}`,
		);
		lines.push(" ".repeat(fieldIndent) + `stability: ${review.stability}`);
		lines.push(
			" ".repeat(fieldIndent) + `difficulty: ${review.difficulty}`,
		);
	}

	return lines;
}

/**
 * Извлекает поле reviews из YAML
 * @param yaml YAML текст
 * @returns Объект с полем reviews или null, если поле не найдено
 */
export function extractReviewsFromYaml(yaml: string): {
	reviews: ReviewSession[];
	startIndex: number;
	endIndex: number;
	indent: number;
} | null {
	try {
		const lines = yaml.split("\n");
		let inReviewsBlock = false;
		let reviewsStartIndex = -1;
		let indentLevel = 0;
		const reviews: ReviewSession[] = [];
		let currentReview: Partial<ReviewSession> = {};
		let currentField = "";

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			const trimmed = line.trim();

			// Находим начало блока reviews
			if (!inReviewsBlock && /^reviews\s*:/i.test(trimmed)) {
				inReviewsBlock = true;
				reviewsStartIndex = i;
				indentLevel = line.search(/\S/);
				continue;
			}

			// Парсим содержимое блока reviews
			if (inReviewsBlock) {
				const currentIndent = line.search(/\S/);

				// Проверяем, вышли ли мы из блока reviews
				if (currentIndent <= indentLevel && trimmed !== "") {
					// Это не reviews или дочерний блок
					if (!trimmed.startsWith("-") && trimmed !== "") {
						inReviewsBlock = false;
						continue;
					}
				}

				// Пропускаем пустые строки
				if (trimmed === "") {
					continue;
				}

				// Парсим элемент массива или поле
				if (trimmed.startsWith("-")) {
					// Новый элемент массива
					if (currentReview.date) {
						// Сохраняем предыдущий review, если он валиден
						if (
							currentReview.date &&
							currentReview.rating &&
							currentReview.stability !== undefined &&
							currentReview.difficulty !== undefined
						) {
							reviews.push(currentReview as ReviewSession);
						}
					}
					currentReview = {};
					currentField = "";
				} else if (trimmed.includes(":")) {
					// Поле элемента массива
					const colonIndex = trimmed.indexOf(":");
					const fieldName = trimmed.substring(0, colonIndex).trim();
					const fieldValue = trimmed
						.substring(colonIndex + 1)
						.trim();

					switch (fieldName.toLowerCase()) {
						case "date":
							currentReview.date = fieldValue.replace(/^['"]|['"]$/g, "");
							break;
						case "rating":
							currentReview.rating = fieldValue.replace(/^['"]|['"]$/g, "") as unknown;
							break;
						case "stability":
							currentReview.stability = parseFloat(fieldValue);
							break;
						case "difficulty":
							currentReview.difficulty = parseFloat(fieldValue);
							break;
					}
				}
			}
		}

		// Добавляем последний review, если он валиден
		if (
			currentReview.date &&
			currentReview.rating &&
			currentReview.stability !== undefined &&
			currentReview.difficulty !== undefined
		) {
			reviews.push(currentReview as ReviewSession);
		}

		if (reviewsStartIndex === -1) {
			return null;
		}

		// Находим конец блока reviews
		let reviewsEndIndex = reviewsStartIndex;
		for (let i = reviewsStartIndex + 1; i < lines.length; i++) {
			const line = lines[i]!;
			const currentIndent = line.search(/\S/);
			if (currentIndent <= indentLevel && line.trim() !== "") {
				// Нашли следующее поле с тем же или меньшим отступом
				reviewsEndIndex = i - 1;
				break;
			}
			reviewsEndIndex = i;
		}

		return {
			reviews,
			startIndex: reviewsStartIndex,
			endIndex: reviewsEndIndex,
			indent: indentLevel,
		};
	} catch (error) {
		console.error("Ошибка при извлечении reviews из YAML:", error);
		return null;
	}
}

/**
 * Проверяет, есть ли в YAML поле reviews
 */
export function hasReviewsField(yaml: string): boolean {
	return /^reviews\s*:/im.test(yaml);
}

/**
 * Создает YAML для нового массива reviews
 */
export function createNewReviewsYaml(reviews: ReviewSession[]): string {
	const lines: string[] = ["reviews:"];

	if (reviews.length === 0) {
		lines.push("  []");
	} else {
		for (const review of reviews) {
			lines.push("  -");
			lines.push(`    date: ${JSON.stringify(review.date)}`);
			lines.push(`    rating: ${JSON.stringify(review.rating)}`);
			lines.push(`    stability: ${review.stability}`);
			lines.push(`    difficulty: ${review.difficulty}`);
		}
	}

	return lines.join("\n");
}
