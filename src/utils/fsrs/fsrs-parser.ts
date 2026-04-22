// Парсеры для работы с YAML и FSRS данными
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */

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

        // Собираем сессии (уже валидированы в Rust)
        const reviews: ReviewSession[] = [];
        for (const session of parsedCard.reviews) {
            // Базовая проверка на наличие полей (на всякий случай)
            if (!session || typeof session !== "object") {
                console.warn(`Invalid session object in ${filePath}, skipping`);
                continue;
            }
            if (
                !session.date ||
                typeof session.date !== "string" ||
                !session.rating ||
                typeof session.rating !== "string" ||
                typeof session.stability !== "number" ||
                isNaN(session.stability) ||
                typeof session.difficulty !== "number" ||
                isNaN(session.difficulty)
            ) {
                console.warn(
                    `Missing or invalid fields in session for ${filePath}, skipping`,
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

        // Если после фильтрации нет сессий, но файл содержит reviews поле,
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
        console.warn(
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
