# Удаление мёртвого кода после миграции кэша в Rust

## Описание

После завершения миграции кэша карточек из TypeScript в Rust (WASM) осталось несколько неиспользуемых функций, файлов и констант. Их удаление уменьшает размер WASM-бандла и улучшает читаемость кода.

## Что сделано

### TypeScript

1. **Удалён файл `src/utils/fsrs/wasm-date.ts`**
   - Функции `getOverdueHours`, `getHoursUntilDue`, `isCardOverdue` дублировались в `src/utils/fsrs/fsrs-time.ts`.
   - Никто не импортировал их из `wasm-date.ts` — все использовали `fsrs-time.ts`.
   - Убран реэкспорт `export * from "./wasm-date"` из `src/utils/fsrs/fsrs-wasm.ts`.

2. **Удалена константа `CARD_SCAN_DEBOUNCE_MS` из `src/constants.ts`**
   - Осталась после замены debounce на `queueMicrotask`. Нигде не использовалась.

### Rust (wasm-lib)

3. **Удалены неиспользуемые WASM-экспорты из `lib.rs`**
   - `filter_cards_for_review` — устаревшая функция фильтрации карточек (без кэша).
   - `sort_cards_by_priority` — устаревшая сортировка по приоритету.
   - `group_cards_by_state` — устаревшая группировка по состоянию.
   - `filter_and_sort_cards` — устаревшая фильтрация/сортировка (без кэша).
   - `filter_and_sort_cards_with_sql` — устаревшая версия с SQL-парсингом.
   - `filter_and_sort_cards_with_states` — заменена на `query_cards`.
   - `my_wasm_function` — тестовая заглушка.

4. **Удалены неиспользуемые внутренние функции из `sort_functions.rs`**
   - `ComputedCardResult` — структура не используется после удаления публичных функций.
   - `compute_cards_states` — не вызывается ниоткуда.
   - Обновлены импорты: убраны `compute_current_state`, `FsrsParameters`, `parse_parameters_from_json`, `Serialize`.

## Проверка

- [x] `npm run lint` — без ошибок
- [x] `npm test` — все 79 тестов проходят
- [x] `npm run build` — успешная сборка WASM и бандла
- [x] `npm run build` — 8 предупреждений Rust (dead code в тестах, не критично)

## Файлы

- **Удалён:** `src/utils/fsrs/wasm-date.ts`
- **Изменён:** `src/utils/fsrs/fsrs-wasm.ts` — убран реэкспорт wasm-date
- **Изменён:** `src/constants.ts` — удалена неиспользуемая константа
- **Изменён:** `wasm-lib/src/lib.rs` — удалены 7 неиспользуемых WASM-функций
- **Изменён:** `wasm-lib/src/sort_functions.rs` — удалены неиспользуемые внутренние функции, обновлены импорты