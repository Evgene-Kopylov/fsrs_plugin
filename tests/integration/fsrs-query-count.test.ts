import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";

describe("queryCount", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),
            reviewCard("история.md"),
            newCard("физика.md"),
        ]);
    });

    it("возвращает общее количество без карточек", () => {
        const sql = ['SELECT file as "Карточка"', "LIMIT 20"].join("\n");

        const count = cache.queryCount(parseSqlBlock(sql), now);

        expect(count.total_count).toBe(3);
        expect(count.errors).toEqual([]);
    });
});
