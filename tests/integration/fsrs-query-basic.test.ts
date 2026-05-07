import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, newCard, fillCache } from "./helpers";
import { DEFAULT_TABLE_BLOCK } from "../../src/commands/add-default-table";

const sql = DEFAULT_TABLE_BLOCK.split("\n").slice(1, -2).join("\n");

describe("Базовая выборка", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [reviewCard("алгебра.md"), newCard("физика.md")]);
    });

    it("возвращает все карточки из кэша с ожидаемой структурой", () => {
        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(2);
        expect(result.total_count).toBe(2);

        for (const cached of result.cards) {
            expect(cached.card).toHaveProperty("filePath");
            expect(cached.card).toHaveProperty("reviews");
            expect(cached.state).toHaveProperty("stability");
            expect(cached.state).toHaveProperty("difficulty");
            expect(cached.state).toHaveProperty("retrievability");
        }
    });
});
