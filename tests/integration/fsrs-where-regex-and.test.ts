import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";

describe("WHERE file ~ 'паттерн' AND state ~ 'паттерн'", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md", { state: "Review" }),
            reviewCard("геометрия.md", { state: "New" }),
            newCard("анализ.md"),
        ]);
    });

    it("возвращает карточки, где оба regex-условия истинны", () => {
        const sql = [
            "SELECT file, state",
            "WHERE file ~ '^алге' AND state ~ 'Review'",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("алгебра.md");
    });
});
