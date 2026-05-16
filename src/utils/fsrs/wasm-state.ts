// Функции состояния карточек для WASM модуля FSRS

import type {
    CardData,
    FSRSRating,
    ComputedCardState,
    HistoricalState,
    FSRSSettings,
} from "../../interfaces/fsrs";
import { prepareCommonArgs } from "./wasm-core";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/** Вычисляет текущее состояние карточки через WASM */
export function computeCardState(
    card: CardData,
    settings: FSRSSettings,
    now: Date = new Date(),
): ComputedCardState {
    try {
        const {
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        } = prepareCommonArgs(card, settings, now);
        const stateJson = wasm.compute_current_state(
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        );
        return JSON.parse(stateJson) as ComputedCardState;
    } catch (error) {
        console.error("computeCardState failed, returning default", error);
        return {
            due: now.toISOString(),
            stability: settings.default_initial_stability,
            difficulty: settings.default_initial_difficulty,
            state: "New",
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            retrievability: 1.0,
        };
    }
}

/** Проверяет, готова ли карточка к повторению через WASM */
export function isCardDue(
    card: CardData,
    settings: FSRSSettings,
    now: Date = new Date(),
): boolean {
    try {
        const {
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        } = prepareCommonArgs(card, settings, now);
        const dueJson = wasm.is_card_due(
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        );
        return JSON.parse(dueJson) as boolean;
    } catch {
        return false;
    }
}

/** Возвращает историю состояний карточки по всем повторениям через WASM */
export function computeCardHistory(
    card: CardData,
    settings: FSRSSettings,
    now: Date = new Date(),
): HistoricalState[] {
    try {
        const {
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        } = prepareCommonArgs(card, settings, now);
        const historyJson = wasm.compute_card_history(
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        );
        return JSON.parse(historyJson) as HistoricalState[];
    } catch {
        return [];
    }
}

/** Получает даты следующего повторения для каждого рейтинга через WASM */
export function getNextReviewDates(
    card: CardData,
    settings: FSRSSettings,
    now: Date = new Date(),
): Record<FSRSRating, string | null> {
    try {
        const {
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        } = prepareCommonArgs(card, settings, now);
        const datesJson = wasm.get_next_review_dates(
            cardJson,
            nowStr,
            parametersJson,
            defaultStability,
            defaultDifficulty,
        );
        const dates = JSON.parse(datesJson) as {
            again?: string;
            hard?: string;
            good?: string;
            easy?: string;
        };
        return {
            again: dates.again || null,
            hard: dates.hard || null,
            good: dates.good || null,
            easy: dates.easy || null,
        };
    } catch {
        return { again: null, hard: null, good: null, easy: null };
    }
}
