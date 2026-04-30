import { describe, it, expect } from "vitest";
import { getMinutesSinceLastReview } from "../../../src/utils/fsrs/fsrs-time";

describe("fsrs-time pure functions", () => {
    describe("getMinutesSinceLastReview", () => {
        it("returns Infinity for card with no reviews", () => {
            const card = { reviews: [], filePath: "test.md" };
            expect(getMinutesSinceLastReview(card)).toBe(Infinity);
        });

        it("returns positive minutes for recent review", () => {
            const now = new Date("2026-01-20T12:00:00Z");
            const card = {
                reviews: [{ date: "2026-01-20T11:00:00Z", rating: 2 }],
                filePath: "test.md",
            };
            expect(getMinutesSinceLastReview(card, now)).toBe(60);
        });

        it("returns zero for review at same time", () => {
            const now = new Date("2026-01-20T12:00:00Z");
            const card = {
                reviews: [{ date: "2026-01-20T12:00:00Z", rating: 2 }],
                filePath: "test.md",
            };
            expect(getMinutesSinceLastReview(card, now)).toBe(0);
        });
    });
});
