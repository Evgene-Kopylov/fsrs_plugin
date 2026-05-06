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

describe("~ (regex) — частичное совпадение строк", () => {
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

    it.skip("WHERE filename ~ 'алгеб.*' — начинается с 'алгеб'", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE filename ~ 'алгеб.*'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/алгебра.md");
    });

    it.skip("WHERE filename ~ 'рия' — содержит подстроку", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE filename ~ 'рия'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/история.md");
    });

    it.skip("WHERE filename ~ '\.md$' — заканчивается на .md", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE filename ~ '\\.md$'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(4);
    });

    it.skip("WHERE file ~ '/архив/' — путь содержит /архив/", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file ~ '/архив/'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("архив/старые/конспект.md");
    });

    it.skip("WHERE file !~ '/notes/' — исключает notes", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE file !~ '/notes/'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        const paths = result.cards.map((c) => c.card.filePath);
        expect(paths).toEqual(["архив/старые/конспект.md"]);
    });

    it.skip("WHERE filename ~ '.*' — совпадает всё", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE filename ~ '.*'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(4);
    });

    it.skip("WHERE filename ~ '^физика' AND state ~ 'New' — два условия", () => {
        const sql = BASE_QUERY.replace(
            "LIMIT 20",
            "WHERE filename ~ '^физика' AND state ~ 'New'\nLIMIT 20",
        );
        const params = parseSqlBlock(sql);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/физика.md");
    });
});
