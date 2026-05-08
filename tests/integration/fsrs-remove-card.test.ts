import { describe, it, expect, beforeEach } from "vitest";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("removeCard", () => {
    const cache = new FsrsCache();

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("алгебра.md"),
            reviewCard("история.md"),
        ]);
    });

    it("удаляет карточку по пути", () => {
        const result = cache.removeCard("алгебра.md");

        expect(result.removed).toBe(true);
        expect(cache.size()).toBe(1);
    });

    it("возвращает removed: false для несуществующей", () => {
        const result = cache.removeCard("несуществующая.md");

        expect(result.removed).toBe(false);
        expect(cache.size()).toBe(2);
    });
});
