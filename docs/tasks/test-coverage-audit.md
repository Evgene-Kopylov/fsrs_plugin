# Аудит тестов: устранение пробелов в покрытии

## Сделано

1. ~~Удалить `tests/unit/utils/fsrs-regex.test.ts`~~ — удалён. Дублировал 7 интеграционных тестов.
2. ~~Добавить тесты `formatDateWithSpecifiers`~~ — 5 тестов в `tests/unit/utils/fsrs-table-format.test.ts`.
3. `formatFieldValue` — зависит от Obsidian `App`, не тестируется без моков (запрещены правилами).
4. ~~Интеграционные~~:
   - ~~`ORDER BY file ASC`~~ → `tests/integration/fsrs-order-by-file-asc.test.ts`
   - ~~`WHERE state = 'Review'`~~ → `tests/integration/fsrs-where-state-review.test.ts`
   - ~~`WHERE stability > 2.0`~~ → `tests/integration/fsrs-where-stability.test.ts`
   - ~~`WHERE difficulty >= 4.0`~~ → `tests/integration/fsrs-where-difficulty.test.ts`

## Итог

Было: 23 файла, 86 тестов. Стало: 26 файлов, 88 тестов. Всё проходит.
