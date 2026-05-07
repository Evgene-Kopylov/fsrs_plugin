import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("ORDER BY file", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("notes/алгебра.md"),
            reviewCard("notes/история.md"),
            reviewCard("notes/физика.md"),
        ]);
    });

    it("ORDER BY file DESC — обратный алфавитный порядок", () => {
        const sql = [
            'SELECT file as "Карточка"',
            "ORDER BY file DESC",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        const paths = result.cards.map((c) => c.card.filePath);
        expect(paths).toEqual([
            "notes/физика.md",
            "notes/история.md",
            "notes/алгебра.md",
        ]);
    });
});
