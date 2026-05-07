import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

const QUERY = [
    'SELECT file as "Карточка", reps as "Повторы"',
    "LIMIT 20",
].join("\n");

describe("ORDER BY reps DESC", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("химия.md", { reps: 1 }),
            reviewCard("алгебра.md", { reps: 5 }),
            reviewCard("физика.md", { reps: 3 }),
        ]);
    });

    it("сортирует по убыванию числа повторений", () => {
        const sql = QUERY.replace(
            "LIMIT 20",
            "ORDER BY reps DESC\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(3);
        const reps = result.cards.map((c) => c.state.reps);
        expect(reps).toEqual([5, 3, 1]);
    });
});
