# Однобуквенные псевдонимы полей d, s, r

## Описание

Добавить однобуквенные псевдонимы для FSRS-полей:

- `d` → `difficulty`
- `s` → `stability`
- `r` → `retrievability`

Сокращения `d-s-r` приняты в сообществе FSRS. Псевдонимы должны работать в SELECT, WHERE, ORDER BY — везде, где ожидается имя поля.

## Изменения

### Rust (WASM)

1. **`types.rs`** — добавить `FIELD_ALIASES: [(&str, &str); 3]` и функцию `resolve_field_alias(field: &str) -> &str`
2. **`parser.rs`** — вызывать `resolve_field_alias` при парсинге:
   - `parse_column_definition` — для колонок
   - `parse_comparison` — для WHERE
   - `parse_order_by_clause` — для ORDER BY
3. **Тесты** — добавить тесты на парсинг с псевдонимами

### Документация

4. **`docs/sql-parser.ru.md`** — добавить раздел про псевдонимы
5. **`docs/sql-syntax.md`** — обновить описание доступных полей

### TypeScript (опционально)

6. **`src/commands/add-default-table.ts`** — можно заменить `difficulty as "D"` на `d as "D"`, etc.

## Принцип

Алиасы разрешаются в парсере, поэтому весь downstream (валидатор, evaluator, sorter, TS-форматтер) работает с полными именами без изменений.
