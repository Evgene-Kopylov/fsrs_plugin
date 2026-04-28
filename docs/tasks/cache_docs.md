### Создан `src/utils/fsrs/fsrs-cache.ts`

Класс `FsrsCache` — тонкая обёртка над WASM-функциями кэша:

| Метод | WASM-функция | Назначение |
|-------|-------------|------------|
| `init()` | `init_cache` | Инициализация/очистка кэша |
| `clear()` | `clear_cache` | Полная очистка |
| `size()` | `get_cache_size` | Количество карточек |
| `addOrUpdateCards(input[])` | `add_or_update_cards` | Пакетное добавление/обновление |
| `removeCard(filePath)` | `remove_card` | Удаление по пути |
| `query(params, now)` | `query_cards` | Запрос с фильтрацией/сортировкой |
| `queryCount(params, now)` | `query_cards_count` | Только количество |
| `getAll()` | `get_all_cards` | Все карточки (отладка) |

**Важные детали:**
- `toRustParams()` преобразует `where` → `where_condition` для совместимости с Rust
- `addOrUpdateCards` сериализует `card.reviews` и `state` в JSON-строки
- Все данные возвращаются как сырые JS-объекты — **никакого кэширования в TS**
