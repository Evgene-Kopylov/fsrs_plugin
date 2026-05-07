import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

const QUERY = [
    'SELECT file as "Карточка", retrievability as "R"',
    "LIMIT 20",
].join("\n");

describe("WHERE retrievability < 0.6", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("история.md", { retrievability: 0.45 }),   // попадёт
            reviewCard("алгебра.md", { retrievability: 0.85 }),   // не попадёт
        ]);
    });

    it("возвращает только карточки с retrievability < 0.6", () => {
        const sql = QUERY.replace(
            "LIMIT 20",
            "WHERE retrievability < 0.6\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("история.md");
    });
});
