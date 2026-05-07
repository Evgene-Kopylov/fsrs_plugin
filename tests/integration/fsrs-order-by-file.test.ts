import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

const QUERY = [
    'SELECT file as "Карточка"',
    "LIMIT 20",
].join("\n");

describe("ORDER BY file", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        // file = file_stem(): алгебра, история, физика
        fillCache(cache, [
            reviewCard("notes/алгебра.md"),
            reviewCard("notes/история.md"),
            reviewCard("notes/физика.md"),
        ]);
    });

    it("ORDER BY file DESC — обратный алфавитный порядок", () => {
        const sql = QUERY.replace(
            "LIMIT 20",
            "ORDER BY file DESC\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        const paths = result.cards.map((c) => c.card.filePath);
        expect(paths).toEqual([
            "notes/физика.md",
            "notes/история.md",
            "notes/алгебра.md",
        ]);
    });
});
