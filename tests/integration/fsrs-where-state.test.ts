import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";

const QUERY = [
    'SELECT file as "Карточка", state as "Состояние"',
    "LIMIT 20",
].join("\n");

describe("WHERE state = '...'", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),             // Review
            newCard("физика.md"),                 // New
        ]);
    });

    it("WHERE state = 'New'", () => {
        const sql = QUERY.replace("LIMIT 20", "WHERE state = 'New'\nLIMIT 20");
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("физика.md");
    });

    it("WHERE state = 'Review'", () => {
        const sql = QUERY.replace("LIMIT 20", "WHERE state = 'Review'\nLIMIT 20");
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("алгебра.md");
    });
});
