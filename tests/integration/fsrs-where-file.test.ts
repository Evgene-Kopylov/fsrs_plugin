import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

const QUERY = [
    'SELECT file as "Карточка"',
    "LIMIT 20",
].join("\n");

describe("WHERE file = '...'", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),                   // file = "алгебра"
            reviewCard("Тема/Квантовая механика.md"),    // file = "Квантовая механика"
        ]);
    });

    it("file = file_stem() — без пути и расширения", () => {
        const sql = QUERY.replace(
            "LIMIT 20",
            "WHERE file = 'Квантовая механика'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("Тема/Квантовая механика.md");
    });

    it("нет совпадений по полному пути", () => {
        const sql = QUERY.replace(
            "LIMIT 20",
            "WHERE file = 'Тема/Квантовая механика.md'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(0);
    });
});
