# Оператор ~ для WHERE (regex)

## Задача

Добавить операторы `~` и `!~` для проверки строки на соответствие регулярному выражению в `WHERE`.

## Синтаксис

```sql
SELECT file, reps
WHERE filename ~ "алгеб.*"
ORDER BY retrievability ASC
```

```sql
SELECT file, state
WHERE file !~ "/архив/"
LIMIT 10
```

```sql
-- Точное совпадение (без wildcard-символов — якоря ^ и $)
WHERE filename ~ "^алгебра\.md$"
```

- `~` — строка соответствует regex
- `!~` — строка НЕ соответствует regex
- Синтаксис regex — стандартный Rust (`regex` crate)
- Регистрозависимость — как в regex (можно `(?i)` для игнорирования регистра)

## Поля, к которым применим ~

Все строковые поля: `file`, `filename`, `state`, `due`.

## Что сделать

### Rust (парсинг)
- В `lexer.rs`: добавить токены `Tilde` (`~`) и `TildeBang` (`!~`)
- В `parser.rs`: парсить `WHERE field ~ "паттерн"` и `WHERE field !~ "паттерн"`
- В `expression.rs`: добавить `ComparisonOp::Regex` и `ComparisonOp::NotRegex`
- В `evaluator.rs`: `regex::Regex::new(&pattern)` → `regex.is_match(&field_value)`

### TypeScript
- Без изменений — всё в Rust

## Тесты (Vitest)

Файл `tests/unit/utils/fsrs-regex.test.ts` — помечены `.skip`, включатся после реализации.
