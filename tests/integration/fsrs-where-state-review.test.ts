import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";

describe("WHERE state = 'Review'", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md", { state: "Review" }),
            reviewCard("история.md", { state: "Review" }),
            newCard("физика.md"),
        ]);
    });

    it("возвращает только карточки в Review", () => {
        const sql = [
            'SELECT file as "Карточка", state as "Состояние"',
            "WHERE state = 'Review'",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(2);
    });
});
