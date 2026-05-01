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

## Доступные строковые поля
- `state` — состояние карточки (`"new"`, `"learning"`, `"review"`, `"relearning"`)
- `due` — дата следующего повторения (формат `YYYY-MM-DD_HH:MM`)
- `file` — путь к файлу

## Доступные операторы сравнения
`=` `!=` `<` `>` `<=` `>=` — работают как для чисел, так и для строк (лексикографически).
