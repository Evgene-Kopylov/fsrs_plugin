# Индекс задач

В папке `docs/tasks/` можно найти задачи. Одна задача — один файл.

## Правила работы

- Задачи отмечаются чекбоксами:
  - `- [ ]` — свободна
  - `- [>]` — в работе
  - `- [x]` — выполнена
- Порядок работы над задачами:
  1. Отметить свободную как в работе `[>]`
  2. Выполнить, провести тесты, сделать коммит
  3. Коммит принимает пользователь, проводит ручные тесты если надо, делает замечания
  4. Довести задачу до принятия пользователем
  5. Отметить задачу выполненной и взять следующую свободную
  6. Если задач в `index.md` нет — обновить его задачами из папки `docs/tasks/`

## Задачи

### Доработка использования поля даты следующего повторения
- [x] доступно ли это поле в таблице? если нет, добавить
- [x] сортировка
- [x] условие
- [x] дата следующего просмотра вместо overdue в примере. 
- [x] возможно, убрать overdue вообще

### Оптимизация кэша: убрать предсериализованные JSON-строки
- [x] Убрать `card_json`/`state_json` из CachedCard, сериализовать только результат — [cache-json-strings-optimization.md](cache-json-strings-optimization.md)

### Использовать metadataCache для инкрементальных обновлений
- [x] В scanSingleCard читать frontmatter из metadataCache, а не через vault.read() — [use-metadata-cache-for-incremental-updates.md](use-metadata-cache-for-incremental-updates.md)

### Передавать структуры в WASM напрямую, без JSON-строк
- [>] Убрать двойную JSON-сериализацию в addOrUpdateCards — [wasm-direct-structs.md](wasm-direct-structs.md)

### Пользовательская статья (normis-article)
- [>] Написать пользовательскую статью о плагине — [normis-article.md](normis-article.md)

### Тепловая карта (Heatmap)
- [x] HeatMap — сколько повторений сделано по дням — [heatmap.md](heatmap.md)

### WHERE file — совпадение по имени, а не полному пути
- [>] Добавить поле `filename` — [where-file-match.md](where-file-match.md)

### Частичное совпадение по строке (LIKE)
- [ ] Добавить оператор `LIKE` для WHERE — [like-operator.md](like-operator.md)

### WASM-модуль в тестах TypeScript
- [x] Настроить загрузку WASM в Vitest, чтобы тесты могли вызывать WASM-функции — [wasm-in-tests.md](wasm-in-tests.md)
