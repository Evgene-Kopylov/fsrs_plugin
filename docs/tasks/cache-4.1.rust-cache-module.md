# cache-4.1.rust-cache-module.md

## Задача: создать модуль `cache.rs` в Rust с глобальным кэшем

Перенести хранение карточек из TypeScript в Rust. Создать новый модуль `cache.rs` с глобальным `HashMap<String, CachedCard>` и базовыми операциями.

## Что нужно сделать

### 1. Создать файл `wasm-lib/src/cache.rs`

Добавить новый модуль с глобальным кэшем. Использовать `std::sync::OnceLock<RefCell<HashMap<String, CachedCard>>>`.

```rust
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::OnceLock;

use crate::types::{ComputedState, ModernFsrsCard};
use serde::{Deserialize, Serialize};

/// Структура карточки в кэше
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedCard {
    pub card: ModernFsrsCard,
    pub state: ComputedState,
}

/// Глобальный кэш карточек
fn global_cache() -> &'static RefCell<HashMap<String, CachedCard>> {
    static CACHE: OnceLock<RefCell<HashMap<String, CachedCard>>> = OnceLock::new();
    CACHE.get_or_init(|| RefCell::new(HashMap::new()))
}
```

### 2. WASM-функции для базовых операций

Добавить в `cache.rs` и экспортировать через `lib.rs`:

#### `init_cache()`
- Очищает кэш, если есть, или создаёт новый.

#### `clear_cache()`
- Полная очистка кэша.

#### `add_or_update_cards(cards_json_array: &str) -> String`
- Принимает JSON-массив объектов вида:
  ```json
  [
    {
      "filePath": "/path/to/file.md",
      "card_json": "{\"reviews\": [...]}",
      "state_json": "{\"due\": \"...\", \"stability\": 5.0, ...}"
    }
  ]
  ```
- Парсит массив, для каждого элемента:
  - Парсит `card_json` -> `ModernFsrsCard`
  - Парсит `state_json` -> `ComputedState`
  - Вставляет/обновляет в кэше по ключу `filePath`
- Возвращает JSON с количеством обновлённых карточек: `{"updated": 5}`.

#### `remove_card(file_path: &str) -> String`
- Удаляет запись из кэша по ключу.
- Возвращает `{"removed": true}` или `{"removed": false, "reason": "not_found"}`.

#### `get_all_cards() -> String`
- Сериализует весь кэш в JSON-массив (для отладки).
- Формат: `[{"filePath": "...", "card": {...}, "state": {...}}, ...]`

### 3. Обновить `lib.rs`

- Добавить объявление модуля: `mod cache;`
- Экспортировать функции через `#[wasm_bindgen]`:
  - `pub fn init_cache()`
  - `pub fn clear_cache()`
  - `pub fn add_or_update_cards(cards_json_array: &str) -> String`
  - `pub fn remove_card(file_path: &str) -> String`
  - `pub fn get_all_cards() -> String`

### 4. Проверка сборки

Убедиться, что проект компилируется:

```bash
cd wasm-lib
cargo build --target wasm32-unknown-unknown
```

### 5. Тестирование

Написать unit-тесты для `cache.rs`:

- `test_init_and_clear` — инициализация и очистка
- `test_add_or_update_cards` — добавление массива карточек
- `test_update_existing` — обновление существующей карточки
- `test_remove_card` — удаление карточки
- `test_remove_nonexistent` — удаление несуществующей карточки

## Критерии готовности

- [ ] Создан `wasm-lib/src/cache.rs`
- [ ] Глобальный кэш через `OnceLock<RefCell<HashMap<String, CachedCard>>>`
- [ ] Реализованы `init_cache`, `clear_cache`, `add_or_update_cards`, `remove_card`, `get_all_cards`
- [ ] Функции экспортированы из `lib.rs` через `#[wasm_bindgen]`
- [ ] `cargo build --target wasm32-unknown-unknown` проходит успешно
- [ ] Unit-тесты написаны и проходят

## Примечания

- WASM однопоточный, поэтому `RefCell` достаточно (без `Mutex`).
- `OnceLock` инициализируется один раз при первом вызове `global_cache()`.
- Все функции возвращают JSON-строку для единообразия с остальными WASM-функциями.
- Парсинг JSON внутри `add_or_update_cards` должен быть устойчивым к ошибкам: если одна карточка не парсится, пропустить её, но обработать остальные.