# Интеграционные тесты

Проверяют связку **TypeScript → WASM**: парсинг SQL, запросы к кэшу,
фильтрация, сортировка и любые другие обращения.

## Правила

- **Сырой SQL.** Каждый тест содержит полное SQL-выражение строкой,
  без `replace`, без сборки из кусков.
- **Импорт дефолтной таблицы** из `src/commands/add-default-table.ts`
  (константа `DEFAULT_TABLE_BLOCK`), а не копирование SQL.
- **Один файл — одно выражение.** `fsrs-where-state.test.ts`,
  `fsrs-order-by-reps.test.ts` и т.д.
- **Наполнение кэша** через хелперы `reviewCard`, `newCard`, `fillCache`.
- **2–3 карточки** в `beforeEach` — минимум для наглядности.
- **Наглядность и простота.** Одно сырое обращение на файл.
  Не дробить, не подставлять значения — повторять реальный сценарий.
  Тест без логики, без условий.

## Структура

```text
helpers.ts                        — фабрики: reviewCard, newCard, fillCache
fsrs-query-basic.test.ts          — реальный DEFAULT_TABLE_BLOCK, дымовая выборка
fsrs-query-count.test.ts          — queryCount
fsrs-limit.test.ts                — LIMIT
fsrs-remove-card.test.ts          — removeCard
fsrs-cache-lifecycle.test.ts      — init, clear, getAll, getHeatmapData
fsrs-where-state-new.test.ts      — WHERE state = 'New'
fsrs-where-state-review.test.ts   — WHERE state = 'Review'
fsrs-where-file.test.ts           — WHERE file = file_stem()
fsrs-where-retrievability.test.ts — WHERE retrievability < 0.6
fsrs-where-stability.test.ts      — WHERE stability > 2.0
fsrs-where-difficulty.test.ts     — WHERE difficulty >= 4.0
fsrs-order-by-reps.test.ts        — ORDER BY reps DESC
fsrs-order-by-file.test.ts        — ORDER BY file DESC
fsrs-order-by-file-asc.test.ts    — ORDER BY file ASC
fsrs-where-regex-anchor.test.ts   — WHERE file ~ '^анкор'
fsrs-where-regex-file-tilde.test.ts   — WHERE file ~ 'подстрока'
fsrs-where-regex-file-not-tilde.test.ts — WHERE file !~ 'паттерн'
fsrs-where-regex-state.test.ts    — WHERE state ~ 'паттерн'
fsrs-where-regex-and.test.ts      — WHERE file ~ '...' AND state ~ '...'
fsrs-where-regex-due.test.ts      — WHERE due ~ '^год'
```

## Пример

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { parseSqlBlock } from "../../src/utils/fsrs-table-params";
import { FsrsCache } from "../../src/utils/fsrs/fsrs-cache";
import { reviewCard, fillCache } from "./helpers";

describe("Фильтрация по retrievability", () => {
    const cache = new FsrsCache();
    const now = new Date("2026-01-25T12:00:00Z");

    beforeEach(() => {
        fillCache(cache, [
            reviewCard("история.md", { retrievability: 0.45 }),
            reviewCard("алгебра.md", { retrievability: 0.85 }),
        ]);
    });

    it("возвращает только карточки с retrievability < 0.6", () => {
        const sql = [
            'SELECT file as "Карточка", retrievability as "R"',
            "WHERE retrievability < 0.6",
            "LIMIT 20",
        ].join("\n");

        const result = cache.query(parseSqlBlock(sql), now);

        expect(result.errors).toEqual([]);
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].card.filePath).toBe("история.md");
    });
});
```

## Запуск

```sh
npx vitest run tests/integration/
```
