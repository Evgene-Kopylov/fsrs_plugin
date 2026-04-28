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

### Перенос кэша в Rust

- [x] [cache-4.1.rust-cache-module.md](./cache-4.1.rust-cache-module.md) — модуль `cache.rs` в Rust: глобальный HashMap, add_or_update_cards, remove_card, clear_cache
- [x] [cache-4.2.query-cards.md](./cache-4.2.query-cards.md) — `query_cards` в Rust: интеграция с существующей filter_and_sort_cards_with_states
- [x] [cache-4.3.ts-fsrs-cache.md](./cache-4.3.ts-fsrs-cache.md) — класс `FsrsCache` в TS: тонкая обёртка над WASM
- [x] [cache-4.4.integration.md](./cache-4.4.integration.md) — интеграция FsrsCache в main.ts, замена IncrementalCache
- [x] [cache-4.5.renderer-update.md](./cache-4.5.renderer-update.md) — обновление FsrsTableRenderer: убрать статический кэш, использовать query_cards
- [>] [cache-4.6.cleanup.md](./cache-4.6.cleanup.md) — удаление старого кода: incremental-cache.ts, fsrs-table-filter.ts, rendererCache
