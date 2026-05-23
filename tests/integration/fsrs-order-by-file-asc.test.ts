import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("ORDER BY file ASC", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("notes/физика.md"),
            reviewCard("notes/алгебра.md"),
            reviewCard("notes/история.md"),
        ]);
    });

    it("сортирует по алфавиту", () => {
        const sql = [
            'SELECT file as "Карточка"',
            "ORDER BY file ASC",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        const paths = result.cards.map((c) => c.card.filePath);
        expect(paths).toEqual([
            "notes/алгебра.md",
            "notes/история.md",
            "notes/физика.md",
        ]);
    });
});
