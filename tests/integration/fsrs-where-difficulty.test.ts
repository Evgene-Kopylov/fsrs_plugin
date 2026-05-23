import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("WHERE difficulty >= 4.0", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md", { difficulty: 5.0 }),
            reviewCard("история.md", { difficulty: 3.5 }),
        ]);
    });

    it("возвращает только карточки с difficulty >= 4.0", () => {
        const sql = [
            'SELECT file as "Карточка", difficulty as "D"',
            "WHERE difficulty >= 4.0",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("алгебра.md");
    });
});
