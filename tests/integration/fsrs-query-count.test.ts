import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";

const QUERY = [
    'SELECT file as "Карточка"',
    "LIMIT 20",
].join("\n");

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
        const params = parseSqlBlock(QUERY);
        const count = cache.queryCount(params, now);

        expect(count.total_count).toBe(3);
        expect(count.errors).toEqual([]);
    });
});
