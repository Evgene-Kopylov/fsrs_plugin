# cache-4.2.query-cards.md

## Задача: реализовать `query_cards` в Rust

Создать функцию `query_cards`, которая принимает параметры запроса (те же `TableParams`), извлекает карточки из глобального кэша, применяет фильтрацию/сортировку/лимит через существующую `filter_and_sort_cards_with_states`, и возвращает результат.

## Что нужно сделать

### 1. Добавить функцию `query_cards` в `wasm-lib/src/cache.rs`

Функция должна:
- Принимать `params_json: &str` (JSON с `TableParams`) и `now_iso: &str` (текущее время ISO)
- Получать все карточки из глобального кэша через `get_all_cached_cards()`
- Преобразовывать их в формат, ожидаемый `filter_and_sort_cards_with_states`:
  - Массив объектов `{"card_json": "...", "state_json": "..."}`
- Вызывать `filter_and_sort_cards_with_states` (из `crate::table_processing::filtering`)
- Возвращать JSON-результат: `{"cards": [...], "total_count": N, "errors": [...]}`

Сигнатура:
```rust
pub fn query_cards(params_json: &str, now_iso: &str) -> String
```

### 2. Экспортировать `query_cards` из `lib.rs`

Добавить в `lib.rs`:
```rust
#[wasm_bindgen]
pub fn query_cards(params_json: &str, now_iso: &str) -> String {
    cache::query_cards(params_json, now_iso)
}

#[wasm_bindgen]
pub fn query_cards_count(params_json: &str, now_iso: &str) -> String {
    cache::query_cards_count(params_json, now_iso)
}
```

Функция `query_cards_count` — упрощённая версия, возвращающая только количество (без карточек): `{"total_count": N, "errors": [...]}`. Это нужно для прогресс-бара при сканировании.

### 3. Написать тесты

- `test_query_cards_empty_cache` — запрос к пустому кэшу
- `test_query_cards_with_data` — запрос с базовыми параметрами (без WHERE)
- `test_query_cards_with_where` — запрос с фильтрацией WHERE
- `test_query_cards_with_sort` — запрос с сортировкой
- `test_query_cards_with_limit` — запрос с лимитом
- `test_query_cards_count` — проверка query_cards_count

### 4. Сборка и тесты

```bash
cd wasm-lib && cargo test
npm run build
```

## Критерии готовности

- [ ] `query_cards(params_json, now_iso)` реализована в `cache.rs`
- [ ] `query_cards_count(params_json, now_iso)` реализована в `cache.rs`
- [ ] Функции экспортированы из `lib.rs`
- [ ] Использует `filter_and_sort_cards_with_states` для фильтрации/сортировки
- [ ] Все тесты проходят (включая остальные 159 тестов)
- [ ] `npm run build` проходит успешно

## Примечания

- `filter_and_sort_cards_with_states` ожидает `settings_json` — передаём пустой объект `{}` или `null`, так как состояния уже готовы и настройки не нужны (кроме дефолтных)
- Результат содержит поле `cards` с массивом `ComputedCard` (каждый с `card_json` и `computed_fields`), поле `total_count` и поле `errors`
- `query_cards_count` должна делать то же самое, но не возвращать карточки (только количество)
- Для тестов нужно создать `TableParams` через `serde_json::from_str` или напрямую