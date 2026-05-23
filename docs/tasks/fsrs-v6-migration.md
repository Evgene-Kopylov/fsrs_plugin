# Миграция с rs-fsrs 1.2.1 (FSRS v5) на fsrs 6.0.0 (FSRS v6)

## Контекст

Репозиторий [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) выпустил версию 6.0.0
(пока только в `main`, не на crates.io). Версия приносит новый API — `MemoryState`
вместо `Card`, рейтинги как `u32`, 21 параметр вместо 17.

Текущий проект использует `rs-fsrs = "1.2.1"` (scheduler-only crate, FSRS v5).
Нужно перейти на `fsrs = "6.0.0"` (полный крейт, FSRS v6).

## План

### 1. Cargo.toml — замена зависимости

- Удалить `rs-fsrs = { version = "1.2.1", features = ["serde"] }`
- Добавить `fsrs = { git = "https://github.com/open-spaced-repetition/fsrs-rs.git", features = ["serde"] }`
  (v6.0.0 не на crates.io, использовать git)

### 2. types.rs — обновить FsrsParameters

- Добавить поле `w: [f32; 21]` — массив w-параметров FSRS
- Убрать `enable_fuzz` (в v6 нет встроенного fuzz — реализуется в TS)
- Оставить `request_retention: f64` и `maximum_interval: f64`

### 3. conversion.rs — переписать

- Удалить импорты `rs_fsrs::{Parameters, Rating, State}`
- Удалить `rating_from_u8()` (рейтинг теперь `u32`: 1=Again, 2=Hard, 3=Good, 4=Easy)
- Удалить `state_to_string()` (State enum больше нет)
- Удалить `create_fsrs_parameters()` (Parameters нет)
- Добавить `create_fsrs(w: &[f32; 21]) -> FSRS` — создание экземпляра FSRS
- Добавить `rating_to_u32(rating: u8) -> u32` (0→1, 1→2, 2→3, 3→4 — сдвиг на 1)
- Добавить функцию `state_label(stability: f32, difficulty: f32, reviews_len: usize) -> &str`
  — эвристика для «New»/«Learning»/«Review»/«Relearning» (если ещё нужно)

### 4. fsrs_logic.rs — Card → MemoryState

- `compute_card_from_reviews()` переписать:
  - Вместо `Card` использовать `MemoryState`
  - Вместо `fsrs.repeat(card, now)` → `fsrs.next_states(state, retention, elapsed_days)`
  - Вместо `HashMap<Rating, SchedulingInfo>` → `NextStates { again, hard, good, easy }`
  - Возвращать `MemoryState` вместо `Card`
- Функция `create_card_from_last_session()` — аналогично

### 5. current_state.rs — адаптировать ComputedState

- `compute_current_state_from_card()`:
  - Убрать `state: String` из `ComputedState` (или вычислять эвристически)
  - `retrievability` через `current_retrievability(state, days_elapsed, decay)`
  - `scheduled_days` через `fsrs.next_interval(stability, retention, rating)`
  - `due` вычислять как `now + scheduled_days`

### 6. next_review.rs — next_states

- `get_next_review_dates()`:
  - Использовать `fsrs.next_states(state, retention, elapsed_days)`
  - `NextReviewDates` поля: брать `interval` из `NextStates.{again,hard,good,easy}`
  - `due = now + interval_days`

### 7. card_history.rs — переписать

- Аналогично `fsrs_logic.rs`: `Card` → `MemoryState`, `repeat` → `next_states`
- `get_retrievability()` → `current_retrievability()`

### 8. Тесты — адаптировать

- Все unit-тесты в затронутых модулях переписать под новый API
- Интеграционные тесты: проверить, что результаты не ломаются

## Оценка рисков

- **Высокий.** Полная смена API, затрагивает ядро вычислений.
- v6.0.0 не на crates.io — git-зависимость может ломаться при force-push в upstream.
- Поведение v6 отличается от v5 — результаты расчётов изменятся.
- Нужно проверить обратную совместимость: карточки, записанные при v5, должны
  корректно обрабатываться v6.

## Критерии готовности

- [ ] `cargo build` проходит без ошибок
- [ ] `cargo test` проходит (unit + интеграционные)
- [ ] Все тесты адаптированы под новый API
- [ ] Поведение проверено на тестовом хранилище
