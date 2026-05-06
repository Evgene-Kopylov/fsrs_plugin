import { describe, it, expect } from "vitest";
import { parseSqlBlock } from "../../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../../src/utils/fsrs/fsrs-cache";
import type { CachedCard } from "../../../src/interfaces/fsrs";

// Тот самый запрос, который плагин вставляет по команде «Add default table»
// (без ```fsrs-table ограждения — Obsidian передаёт только содержимое)
const DEFAULT_QUERY = [
    'SELECT file as " ", difficulty as "D",',
    '       stability as "S", retrievability as "R",',
    "       date_format(due, '%d.%m.%Y') as \"Следующее\"",
    "LIMIT 20",
].join("\n");

/** Тестовые карточки, которые кладём в кэш */
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
    makeCard("notes/алгебра.md", [
        { date: "2026-01-10T12:00:00Z", rating: 2 },
        { date: "2026-01-15T12:00:00Z", rating: 3 },
    ]),
    makeCard("notes/история.md", [{ date: "2026-01-20T12:00:00Z", rating: 1 }]),
    makeCard("notes/физика.md", [], "New"),
];

describe("FSRS-таблица: от SQL-запроса до результата", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    // Наполняем кэш один раз перед всеми тестами
    cache.init();
    cache.addOrUpdateCards(
        testCards.map((c) => ({
            filePath: c.card.filePath,
            card: c.card,
            state: c.state,
        })),
    );

    it("парсит дефолтный SQL-запрос без ошибок", () => {
        const params = parseSqlBlock(DEFAULT_QUERY);

        expect(params.columns).toHaveLength(5);
        expect(params.columns[0]).toMatchObject({ field: "file", title: " " });
        expect(params.columns[1]).toMatchObject({
            field: "difficulty",
            title: "D",
        });
        expect(params.columns[2]).toMatchObject({
            field: "stability",
            title: "S",
        });
        expect(params.columns[3]).toMatchObject({
            field: "retrievability",
            title: "R",
        });
        expect(params.limit).toBe(20);
    });

    it("возвращает карточки из кэша по запросу", () => {
        const params = parseSqlBlock(DEFAULT_QUERY);
        const result = cache.query(params, now);

        expect(result.errors).toEqual([]);
        expect(result.cards.length).toBe(3);
        expect(result.total_count).toBe(3);
    });

    it("каждая карточка содержит card и state", () => {
        const params = parseSqlBlock(DEFAULT_QUERY);
        const result = cache.query(params, now);

        for (const cached of result.cards) {
            expect(cached).toHaveProperty("card");
            expect(cached).toHaveProperty("state");
            expect(cached.card).toHaveProperty("filePath");
            expect(cached.card).toHaveProperty("reviews");
            expect(cached.state).toHaveProperty("stability");
            expect(cached.state).toHaveProperty("difficulty");
            expect(cached.state).toHaveProperty("retrievability");
        }
    });

    it("WHERE state = 'new' — только физика", () => {
        const queryWithWhere = DEFAULT_QUERY.replace(
            "LIMIT 20",
            "WHERE state = 'new'\nLIMIT 20",
        );
        const params = parseSqlBlock(queryWithWhere);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("notes/физика.md");
    });

    it("ORDER BY file DESC — алфавитный порядок", () => {
        const queryWithOrder = DEFAULT_QUERY.replace(
            "LIMIT 20",
            "ORDER BY file DESC\nLIMIT 20",
        );
        const params = parseSqlBlock(queryWithOrder);
        const result = cache.query(params, now);

        const paths = result.cards.map((c) => c.card.filePath);
        expect(paths).toEqual([
            "notes/физика.md",
            "notes/история.md",
            "notes/алгебра.md",
        ]);
    });

    it("LIMIT 2 — только две первые", () => {
        const queryWithLimit = DEFAULT_QUERY.replace("LIMIT 20", "LIMIT 2");
        const params = parseSqlBlock(queryWithLimit);
        const result = cache.query(params, now);

        expect(result.cards).toHaveLength(2);
        expect(result.total_count).toBe(3); // всего три, но вернули две
    });

    it("queryCount — быстрый подсчёт без карточек", () => {
        const params = parseSqlBlock(DEFAULT_QUERY);
        const count = cache.queryCount(params, now);

        expect(count.total_count).toBe(3);
        expect(count.errors).toEqual([]);
    });
});
