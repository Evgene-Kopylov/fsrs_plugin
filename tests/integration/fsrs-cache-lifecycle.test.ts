import { describe, it, expect, beforeEach } from "vitest";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("Жизненный цикл кэша", () => {
    const cache = new FsrsCache();

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),
            reviewCard("история.md"),
        ]);
    });

    it("init очищает кэш", () => {
        expect(cache.size()).toBe(2);

        cache.init();

        expect(cache.size()).toBe(0);
    });

    it("getAll возвращает все карточки", () => {
        const all = cache.getAll();

        expect(all).toHaveLength(2);
        expect(all[0].card).toHaveProperty("filePath");
        expect(all[0].state).toHaveProperty("retrievability");
    });

    it("getAll после clear возвращает пустой массив", () => {
        cache.clear();

        expect(cache.getAll()).toEqual([]);
    });
});

describe("Тепловая карта", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [reviewCard("алгебра.md")]);
    });

    it("getHeatmapData возвращает структуру с ячейками", () => {
        const data = cache.getHeatmapData(now, 53, "ru");

        expect(data.title).toBeTruthy();
        expect(data.month_names).toHaveLength(12);
        expect(data.day_labels).toHaveLength(7);
        expect(data.cells.length).toBeGreaterThan(0);
        expect(data.weeks).toBeGreaterThan(0);
    });

    it("getHeatmapData с нулём карточек не падает", () => {
        cache.clear();

        const data = cache.getHeatmapData(now, 53, "ru");

        expect(data.cells.length).toBeGreaterThan(0);
        expect(data.error).toBeUndefined();
    });
});
