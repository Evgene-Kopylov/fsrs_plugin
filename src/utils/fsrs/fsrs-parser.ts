// Парсеры для работы с YAML и FSRS данными

import type {
	ModernFSRSCard,
	ReviewSession,
	ParseResult,
} from "../../interfaces/fsrs";

/**
 * Парсит frontmatter файла и извлекает карточку в новом формате
 */
export function parseModernFsrsFromFrontmatter(
	frontmatter: string,
	filePath: string,
): ParseResult {
	try {
		// Пробуем распарсить YAML
		const parsed = parseYaml(frontmatter);
		if (!parsed) {
			return {
				success: false,
				card: null,
				error: "Failed to parse YAML",
			};
		}

		// Проверяем наличие флага srs
		if (parsed.srs !== true) {
			return {
				success: false,
				card: null,
				error: "srs flag is not true",
			};
		}

		// Проверяем наличие массива reviews
		if (!parsed.reviews || !Array.isArray(parsed.reviews)) {
			return {
				success: false,
				card: null,
				error: "reviews array is missing or invalid",
			};
		}

		// Валидируем каждую сессию
		const reviews: ReviewSession[] = [];
		for (const session of parsed.reviews) {
			if (
				!session.date ||
				!session.rating ||
				typeof session.stability !== "number" ||
				typeof session.difficulty !== "number"
			) {
				console.warn(`Invalid review session in ${filePath}:`, session);
				continue;
			}

			reviews.push({
				date: session.date,
				rating: session.rating,
				stability: session.stability,
				difficulty: session.difficulty,
			});
		}

		const card: ModernFSRSCard = {
			srs: true,
			reviews,
			filePath,
		};

		return { success: true, card, error: undefined };
	} catch (error) {
		console.error(
			`Ошибка при парсинге FSRS полей из файла ${filePath}:`,
			error,
		);
		return {
			success: false,
			card: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Основной парсер YAML
 */
export function parseYaml(yaml: string): any {
	try {
		const lines = yaml.split("\n");
		const stack: Array<{ obj: any; key: string | null; indent: number }> =
			[];
		const root: any = {};
		let current: { obj: any; key: string | null; indent: number } = {
			obj: root,
			key: null,
			indent: -1,
		};
		let i = 0;

		while (i < lines.length) {
			const line = lines[i]!;
			const trimmed = line.trim();

			// Пропускаем пустые строки и комментарии
			if (trimmed === "" || trimmed.startsWith("#")) {
				i++;
				continue;
			}

			// Определяем уровень отступа
			const indent = line.search(/\S/);
			if (indent === -1) {
				i++;
				continue;
			}

			// Возвращаемся на нужный уровень в стеке
			while (
				stack.length > 0 &&
				indent <= stack[stack.length - 1]!.indent
			) {
				stack.pop();
			}
			if (stack.length > 0) {
				current = stack[stack.length - 1]!;
			} else {
				current = { obj: root, key: null, indent: -1 };
			}

			// Обработка элемента массива
			if (trimmed.startsWith("- ")) {
				const content = trimmed.substring(2).trim();

				// Если текущий объект не массив, создаем его
				if (!Array.isArray(current.obj[current.key!])) {
					current.obj[current.key!] = [];
				}

				const array = current.obj[current.key!] as any[];

				if (content.includes(":")) {
					// Объект внутри массива - делим только по первому двоеточию
					const colonIndex = content.indexOf(":");
					const key = content.substring(0, colonIndex).trim();
					const value = content.substring(colonIndex + 1).trim();

					const item: any = {};
					item[key] = parseYamlValue(value);
					array.push(item);

					// Добавляем в стек для возможных вложенных элементов
					stack.push({
						obj: item,
						key: key,
						indent: indent,
					});
				} else {
					// Простое значение в массиве
					array.push(parseYamlValue(content));
				}
			} else if (trimmed.includes(":")) {
				// Обработка пары ключ-значение
				const colonIndex = trimmed.indexOf(":");
				const key = trimmed.substring(0, colonIndex).trim();
				let value = trimmed.substring(colonIndex + 1).trim();

				// Проверяем, является ли значение массивом (следующая строка начинается с "-")
				if (value === "" && i + 1 < lines.length) {
					const nextLine = lines[i + 1]!;
					const nextIndent = nextLine.search(/\S/);
					if (
						nextIndent > indent &&
						nextLine.trim().startsWith("-")
					) {
						// Это начало массива
						current.obj[key] = [];
						stack.push({
							obj: current.obj,
							key: key,
							indent: indent,
						});
						i++;
						continue;
					}
				}

				// Обычное значение
				current.obj[key] = parseYamlValue(value);

				// Если значение объект (пустая строка после двоеточия), добавляем в стек
				if (value === "" && i + 1 < lines.length) {
					const nextLine = lines[i + 1]!;
					const nextIndent = nextLine.search(/\S/);
					if (nextIndent > indent && nextLine.includes(":")) {
						current.obj[key] = {};
						stack.push({
							obj: current.obj[key],
							key: null,
							indent: indent,
						});
					}
				}
			}

			i++;
		}

		return root;
	} catch (error) {
		console.error("Ошибка при парсинге YAML:", error);
		return null;
	}
}

/**
 * Парсер значений YAML
 */
export function parseYamlValue(valueStr: string): any {
	if (valueStr === "true") return true;
	if (valueStr === "false") return false;
	if (valueStr === "null") return null;
	if (valueStr === "[]") return [];
	if (valueStr === "{}") return {};

	// Числа
	const trimmed = valueStr.trim();
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		const num = parseFloat(trimmed);
		return isNaN(num) ? trimmed : num;
	}

	// Строки в кавычках
	if (
		(valueStr.startsWith('"') && valueStr.endsWith('"')) ||
		(valueStr.startsWith("'") && valueStr.endsWith("'"))
	) {
		return valueStr.substring(1, valueStr.length - 1);
	}

	// Простые строки
	return valueStr;
}
