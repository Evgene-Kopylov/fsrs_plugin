# SQL-синтаксис

## Примеры новых запросов

### Фильтр по состоянию

```sql
SELECT file, due, retrievability
WHERE state = "review"
ORDER BY retrievability ASC
LIMIT 20
```

### Исключить карточки в обучении

```sql
SELECT file, stability, difficulty
WHERE state != "learning"
```

### Карточки до определённой даты

```sql
SELECT file, due, reps
WHERE due < "2025-06-01"
```

### Диапазон дат

```sql
SELECT file, due
WHERE due >= "2025-01-01" AND due <= "2025-06-01"
ORDER BY due ASC
```

### Поиск по имени файла

```sql
SELECT file, reps, state
WHERE file = "математика/интегралы.md"
```

### Смешанные условия: строка + число

```sql
SELECT file, stability, retrievability
WHERE state = "review" AND retrievability < 0.5
ORDER BY retrievability ASC
LIMIT 10
```

### Два строковых условия через OR

```sql
SELECT file, due, state
WHERE state = "review" OR state = "relearning"
ORDER BY due ASC
```

## Доступные числовые поля

- `difficulty` (сложность, D) — псевдоним: `d`
- `stability` (стабильность, S) — псевдоним: `s`
- `retrievability` (извлекаемость, R) — псевдоним: `r`
- `reps` — количество повторений
- `elapsed` — дней с последнего повторения
- `scheduled` — дней до следующего повторения

## Доступные строковые поля

- `state` — состояние карточки (`"new"`, `"learning"`, `"review"`, `"relearning"`)
- `due` — дата следующего повторения (формат `YYYY-MM-DD_HH:MM`)
- `file` — путь к файлу

## Псевдонимы полей

Для трёх основных FSRS-параметров можно использовать однобуквенные
сокращения, принятые в сообществе:

| Сокращение | Полное имя | Описание |
|-----------|------------|----------|
| `d` | `difficulty` | Сложность |
| `s` | `stability` | Стабильность |
| `r` | `retrievability` | Извлекаемость |

Псевдонимы работают в SELECT, WHERE, ORDER BY и `date_format(...)`:

```sql
SELECT d as "D", s as "S", r as "R"
WHERE s > 3.0 AND d < 7.0
ORDER BY r ASC
```

Это равносильно:

```sql
SELECT difficulty as "D", stability as "S", retrievability as "R"
WHERE stability > 3.0 AND difficulty < 7.0
ORDER BY retrievability ASC
```

## Доступные операторы сравнения

`=` `!=` `<` `>` `<=` `>=` — работают как для чисел, так и для строк (лексикографически).
