import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";

describe("WHERE file !~ 'паттерн'", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),
            reviewCard("геометрия.md"),
            newCard("физика.md"),
        ]);
    });

    it("исключает карточки, совпавшие с паттерном", () => {
        const sql = [
            "SELECT file",
            "WHERE file !~ 'алге'",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(2);
        const paths = result.cards.map((c) => c.card.filePath).sort();
        expect(paths).toEqual(["геометрия.md", "физика.md"]);
    });
});
