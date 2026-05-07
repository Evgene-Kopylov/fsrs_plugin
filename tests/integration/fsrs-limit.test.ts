import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("LIMIT", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),
            reviewCard("история.md"),
            reviewCard("физика.md"),
        ]);
    });

    it("LIMIT 2 — возвращает две, total_count = 3", () => {
        const sql = ['SELECT file as "Карточка"', "LIMIT 2"].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.cards).toHaveLength(2);
        expect(result.total_count).toBe(3);
    });
});
