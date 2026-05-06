# Оператор LIKE для WHERE

## Задача

Добавить оператор `LIKE` (и возможно `NOT LIKE`) для частичного совпадения строк в `WHERE`.

## Синтаксис

```sql
SELECT file, reps
WHERE file LIKE "%запутанность%"
ORDER BY retrievability ASC
```

Символ `%` — любое количество любых символов (как в SQL).

## Что сделать

### Rust (парсинг)
- В `lexer.rs`: добавить токены `LIKE`, `NOT`, `%`
- В `parser.rs`: парсить `WHERE field LIKE "паттерн"` и `WHERE field NOT LIKE "паттерн"`
- В `expression.rs`: добавить `ComparisonOp::Like` и `ComparisonOp::NotLike`
- В `evaluator.rs`: реализовать сравнение — преобразовать SQL-паттерн (`%`) в regex, проверять совпадение

### TypeScript
- Без изменений — всё в Rust

## Приоритет

После таски `where-file-match` (поле `filename`), так как `LIKE` по полю `file` решит ту же проблему универсальнее.
