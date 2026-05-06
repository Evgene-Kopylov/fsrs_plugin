import { describe, it, expect } from "vitest";
import { parseSqlBlock } from "../../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../../src/utils/fsrs/fsrs-cache";
import type { CachedCard } from "../../../src/interfaces/fsrs";

function makeCard(
    filePath: string,
    reviews: Array<{ date: string; rating: number }>,
    state: "New" | "Review" = "Review",
): CachedCard {
    return {
        card: { filePath, reviews },
        state: {
            due: "2026-02-01T12:00:00.000Z",
            stability: 2.5,
            difficulty: 5.0,
            state,
            elapsed_days: 3,
            scheduled_days: 5,
            reps: reviews.length,
            lapses: 0,
            retrievability: 0.85,
        },
    };
}

const testCards: CachedCard[] = [
    makeCard("notes/алгебра.md", [{ date: "2026-01-10T12:00:00Z", rating: 2 }]),
    makeCard("notes/история.md", [{ date: "2026-01-20T12:00:00Z", rating: 1 }]),
    makeCard("notes/физика.md", [], "New"),
    makeCard("архив/старые/конспект.md", [
        { date: "2025-06-01T12:00:00Z", rating: 2 },
    ]),
];

const BASE_QUERY = "SELECT file, state\nLIMIT 20";

describe("~ (regex) — фильтрация строк", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    cache.init();
    cache.addOrUpdateCards(
        testCards.map((c) => ({
            filePath: c.card.filePath,
            card: c.card,
            state: c.state,
        })),
    );

    it("WHERE file ~ 'алгеб.*' — стем начинается с 'алгеб'", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ 'алгеб.*'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/алгебра.md");
    });

    it("WHERE file ~ 'рия' — стем содержит подстроку", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ 'рия'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/история.md");
    });

    it("WHERE file ~ '^физика' — якорь начала строки", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ '^физика'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/физика.md");
    });

    it("WHERE file !~ '^алге' — исключает стемы на 'алге'", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file !~ '^алге'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        const paths = result.cards.map((c) => c.card.filePath).sort();
        expect(paths).toEqual([
            "архив/старые/конспект.md",
            "notes/история.md",
            "notes/физика.md",
        ].sort());
    });

    it("WHERE file ~ '.*' — совпадает всё", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ '.*'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(4);
    });

    it("WHERE file ~ '^физика' AND state ~ 'New' — два regex-условия", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ '^физика' AND state ~ 'New'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/физика.md");
    });

    it("WHERE file ~ 'конспект' — стем из вложенной папки", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ 'конспект'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("архив/старые/конспект.md");
    });
});
