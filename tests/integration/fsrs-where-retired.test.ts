import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

const sql = ['SELECT file as "Карточка"', "LIMIT 20"].join("\n");

describe("WHERE retired = 0 — умолчание", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("активная.md"),
            {
                filePath: "выведенная.md",
                card: {
                    filePath: "выведенная.md",
                    reviews: [
                        { date: "2026-01-01T10:00:00Z", rating: 2 },
                    ],
                    retired: true,
                },
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
                },
            },
        ]);
    });

    it("retired-карточка не попадает в выборку без WHERE", () => {
        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.total_count).toBe(1);
        expect(result.cards[0].card.filePath).toBe("активная.md");
    });

    it("WHERE retired = 1 возвращает только retired", () => {
        const explicitSql = [
            'SELECT file as "Карточка"',
            "WHERE retired = 1",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(explicitSql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.total_count).toBe(1);
        expect(result.cards[0].card.filePath).toBe("выведенная.md");
    });
});
