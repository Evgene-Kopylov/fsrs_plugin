// Парсеры для работы с YAML и FSRS данными
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

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
		// Проверяем, содержит ли frontmatter поле reviews (базовая проверка перед вызовом WASM)
		if (!/reviews\s*:/m.test(frontmatter)) {
			return {
				success: false,
				card: null,
				error: "not a FSRS card (missing reviews field)",
			};
		}

		// WASM ожидает полный frontmatter с ---, поэтому оборачиваем
		const wrappedFrontmatter = `---\n${frontmatter}\n---`;

		const cardJson =
			extract_fsrs_from_frontmatter_wrapped(wrappedFrontmatter);

		// Проверяем результат WASM перед парсингом JSON
		if (cardJson === "null" || !cardJson) {
			console.warn(
				`FSRS card in ${filePath} is broken: WASM parsing returned null or empty. Ignoring card.`,
			);
			return {
				success: false,
				card: null,
				error: "WASM parsing failed - broken card",
			};
		}

		// Парсим JSON результат из WASM
		const parsedCard = JSON.parse(cardJson);

		if (
			!parsedCard ||
			!parsedCard.reviews ||
			!Array.isArray(parsedCard.reviews)
		) {
			console.warn(
				`FSRS card in ${filePath} has invalid reviews field. Ignoring card.`,
			);
			return {
				success: false,
				card: null,
				error: "reviews array is missing or invalid",
			};
		}

		// Валидируем каждую сессию

		const reviews: ReviewSession[] = [];
		const validRatings = ["Again", "Hard", "Good", "Easy"];
		const validationErrors: string[] = [];

		for (let i = 0; i < parsedCard.reviews.length; i++) {
			const session = parsedCard.reviews[i];

			// Пропускаем пустые объекты или null
			if (!session || typeof session !== "object") {
				validationErrors.push(`Session ${i}: is not a valid object`);
				continue;
			}

			// Проверяем обязательные поля

			if (!session.date || typeof session.date !== "string") {
				validationErrors.push(`Session ${i}: invalid or missing date`);
				continue;
			}

			// Проверяем валидность рейтинга

			if (
				!session.rating ||
				typeof session.rating !== "string" ||
				!validRatings.includes(session.rating)
			) {
				validationErrors.push(
					`Session ${i}: invalid rating "${session.rating}"`,
				);
				continue;
			}

			// Проверяем числовые поля

			if (
				typeof session.stability !== "number" ||
				isNaN(session.stability)
			) {
				validationErrors.push(
					`Session ${i}: invalid stability "${session.stability}"`,
				);
				continue;
			}

			if (
				typeof session.difficulty !== "number" ||
				isNaN(session.difficulty)
			) {
				validationErrors.push(
					`Session ${i}: invalid difficulty "${session.difficulty}"`,
				);
				continue;
			}

			// Проверяем валидность даты (примерная проверка ISO формата)
			try {
				const date = new Date(session.date);
				if (isNaN(date.getTime())) {
					validationErrors.push(
						`Session ${i}: invalid date format "${session.date}"`,
					);
					continue;
				}
			} catch {
				validationErrors.push(
					`Session ${i}: invalid date format "${session.date}"`,
				);
				continue;
			}

			reviews.push({
				date: session.date,

				rating: session.rating,

				stability: session.stability,

				difficulty: session.difficulty,
			});
		}

		// Проверяем, является ли карточка битой (любые ошибки валидации)
		if (validationErrors.length > 0) {
			// Есть невалидные сессии - карточка битая
			console.warn(
				`FSRS card in ${filePath} is broken: ${validationErrors.length} invalid review sessions out of ${parsedCard.reviews.length} total. Ignoring card.`,
			);
			return {
				success: false,
				card: null,
				error: "review sessions validation failed",
			};
		}

		// Если после валидации нет ни одной сессии, но файл содержит reviews поле,
		// считаем это успехом с пустым массивом сессий (карточка без повторений)

		const card: ModernFSRSCard = {
			reviews,
			filePath,
		};

		return {
			success: true,
			card,
			error: undefined,
		};
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
