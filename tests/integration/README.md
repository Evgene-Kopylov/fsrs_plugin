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
fsrs-where-state.test.ts          — WHERE state
fsrs-where-file.test.ts           — WHERE file (file = file_stem)
fsrs-where-retrievability.test.ts — WHERE retrievability < 0.6
fsrs-order-by-reps.test.ts        — ORDER BY reps DESC
fsrs-order-by-file.test.ts        — ORDER BY file DESC
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
