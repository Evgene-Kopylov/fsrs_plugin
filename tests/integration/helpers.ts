import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import type { ComputedCardState } from "../../src/interfaces/fsrs";

/** Готовая карточка Review */
export function reviewCard(filePath: string, overrides: Partial<ComputedCardState> = {}): {
    filePath: string;
    card: { filePath: string; reviews: Array<{ date: string; rating: number }> };
    state: ComputedCardState;
} {
    return {
        filePath,
        card: { filePath, reviews: [] },
        state: {
            due: "2026-02-01T12:00:00.000Z",
            stability: 2.5,
            difficulty: 5.0,
            state: "Review",
            elapsed_days: 3,
            scheduled_days: 5,
            reps: 2,
            lapses: 0,
            retrievability: 0.85,
            ...overrides,
        },
    };
}

/** Готовая карточка New */
export function newCard(filePath: string): {
    filePath: string;
    card: { filePath: string; reviews: Array<{ date: string; rating: number }> };
    state: ComputedCardState;
} {
    return reviewCard(filePath, {
        due: "2026-03-01T12:00:00.000Z",
        stability: 0.0,
        difficulty: 0.0,
        state: "New",
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        retrievability: 0.0,
    });
}

/** Наполняет кэш переданными карточками (init + add) */
export function fillCache(
    cache: FsrsCache,
    cards: Array<{
        filePath: string;
        card: { filePath: string; reviews: Array<{ date: string; rating: number }> };
        state: ComputedCardState;
    }>,
): void {
    cache.init();
    cache.addOrUpdateCards(cards);
}
