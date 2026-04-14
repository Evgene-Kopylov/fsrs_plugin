// Парсеры для работы с YAML и FSRS данными

import type {
	ModernFSRSCard,
	ReviewSession,
	ParseResult,
} from "../../interfaces/fsrs";
import { extract_fsrs_from_frontmatter_wrapped } from "../../../wasm-lib/pkg/wasm_lib.js";

/**
 * Парсит frontmatter файла и извлекает карточку в новом формате
 */
export function parseModernFsrsFromFrontmatter(
	frontmatter: string,
	filePath: string,
): ParseResult {
	try {
		console.log(
			`DEBUG parseModernFsrsFromFrontmatter: filePath=${filePath}, frontmatter length=${frontmatter.length}`,
		);
		console.log(
			`DEBUG frontmatter preview: ${frontmatter.substring(0, 200)}...`,
		);

		// Проверяем, содержит ли frontmatter поле reviews (базовая проверка перед вызовом WASM)
		if (!/reviews\s*:/m.test(frontmatter)) {
			console.log(`DEBUG: frontmatter does NOT contain reviews field`);
			return {
				success: false,
				card: null,
				error: "not a FSRS card (missing reviews field)",
			};
		}

		// Используем WASM для извлечения FSRS карточки из frontmatter
		// WASM ожидает полный frontmatter с ---, поэтому оборачиваем
		const wrappedFrontmatter = `---\n${frontmatter}\n---`;
		console.log(
			`DEBUG: Calling WASM extract_fsrs_from_frontmatter_wrapped with wrapped frontmatter`,
		);
		console.log(
			`DEBUG: wrappedFrontmatter: ${wrappedFrontmatter.substring(0, 200)}...`,
		);
		const cardJson =
			extract_fsrs_from_frontmatter_wrapped(wrappedFrontmatter);
		console.log(
			`DEBUG: WASM returned cardJson (length=${cardJson.length}): ${cardJson.substring(0, 200)}...`,
		);

		// Парсим JSON результат из WASM
		console.log(`DEBUG: Parsing JSON from WASM result`);
		const parsedCard = JSON.parse(cardJson);
		console.log(`DEBUG: Parsed card structure:`, parsedCard);

		if (!parsedCard.reviews || !Array.isArray(parsedCard.reviews)) {
			console.log(
				`DEBUG: parsedCard.reviews is missing or not an array:`,
				parsedCard.reviews,
			);
			return {
				success: false,
				card: null,
				error: "reviews array is missing or invalid",
			};
		}
		console.log(
			`DEBUG: parsedCard.reviews array length: ${parsedCard.reviews.length}`,
		);

		// Валидируем каждую сессию
		console.log(`DEBUG: Validating review sessions`);
		const reviews: ReviewSession[] = [];
		for (let i = 0; i < parsedCard.reviews.length; i++) {
			const session = parsedCard.reviews[i];
			console.log(`DEBUG: Session ${i}:`, session);

			if (
				!session.date ||
				!session.rating ||
				typeof session.stability !== "number" ||
				typeof session.difficulty !== "number"
			) {
				console.warn(`Invalid review session in ${filePath}:`, session);
				console.log(
					`DEBUG: Session validation failed - missing required fields`,
				);
				continue;
			}

			reviews.push({
				date: session.date,
				rating: session.rating,
				stability: session.stability,
				difficulty: session.difficulty,
			});
			console.log(`DEBUG: Session ${i} added to reviews`);
		}

		console.log(
			`DEBUG: Creating ModernFSRSCard with ${reviews.length} reviews, filePath=${filePath}`,
		);
		const card: ModernFSRSCard = {
			reviews,
			filePath,
		};

		console.log(
			`DEBUG: parseModernFsrsFromFrontmatter SUCCESS for ${filePath}`,
		);
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
