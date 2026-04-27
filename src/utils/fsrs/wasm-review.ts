// Функции повторения карточек для WASM модуля FSRS

import type {
    ModernFSRSCard,
    FSRSRating,
    FSRSSettings,
} from "../../interfaces/fsrs";
import { ratingToNumber } from "../../interfaces/fsrs";
import { prepareCommonArgs } from "./wasm-core";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/** Добавляет сессию повторения через WASM */
export function addReviewSession(
    card: ModernFSRSCard,
    rating: FSRSRating,
    settings: FSRSSettings,
    now: Date = new Date(),
): ModernFSRSCard {
    try {
        const {
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        } = prepareCommonArgs(card, settings, now);
        const updatedJson = wasm.review_card(
            cardJson,
            ratingToNumber(rating),
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        );
        const parsed = JSON.parse(updatedJson) as ModernFSRSCard;
        return { ...parsed, filePath: card.filePath };
    } catch (error) {
        console.error("addReviewSession failed", error);
        throw error;
    }
}

/** Получает YAML новой карточки через WASM */
export function getNewCardYaml(): string {
    try {
        return wasm.get_fsrs_yaml();
    } catch {
        return "reviews: []";
    }
}

/** Получает YAML карточки после повторения через WASM */
export function getCardYamlAfterReview(
    card: ModernFSRSCard,
    rating: FSRSRating,
    settings: FSRSSettings,
    now: Date = new Date(),
): string {
    try {
        const {
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        } = prepareCommonArgs(card, settings, now);
        return wasm.get_fsrs_yaml_after_review(
            cardJson,
            ratingToNumber(rating),
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        );
    } catch {
        return "reviews: []";
    }
}
