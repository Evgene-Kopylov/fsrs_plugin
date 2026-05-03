# Передавать структуры в WASM напрямую, без JSON-строк

## Проблема

Сейчас `add_or_update_cards` получает от TS JSON-строку, внутри которой `card_json` и `state_json` —
вложенные JSON-строки. TS делает лишнюю работу: сериализует объекты в JSON-строки,
WASM их парсит обратно. Сложность размазана между TS и WASM без причины.

При 4964 карточках — ~10 000 JSON-парсингов в WASM + столько же сериализаций в TS.

## Решение

TS передаёт в WASM сырой массив объектов `{ filePath, card: CardData, state: ComputedState }`
без предварительной сериализации в JSON-строки. WASM сам принимает и разбирает.

### Попытка 1: serde_wasm_bindgen

Не подходит. `JsValue` не реализует `serde::Deserialize`, поэтому не может быть полем
в структуре с `#[derive(Deserialize)]`. `serde_wasm_bindgen::from_value` работает
с целым значением, но не с полями-`JsValue` внутри.

### Альтернативы

- **js_sys::Reflect** — получать поля через `Reflect::get` из JS-объекта,
  десериализовать каждое через `serde_wasm_bindgen::from_value`.
- **JSON как промежуточный** — внутри WASM принимать массив JsValue,
  для каждой карточки делать `JSON.stringify` → `serde_json::from_str`.
  Меньше накладных расходов чем сейчас (нет ручной сериализации в TS и
  вложенных JSON-строк).

## Ожидаемый эффект

- Ускорение загрузки кэша (3 с → меньше)
- Меньше виолейшонов — парсинг JSON заменён на прямую десериализацию

## Файлы

- `src/main.ts` — `performCacheScanAsync`
- `src/utils/fsrs/fsrs-cache.ts` — `addOrUpdateCards`
- `wasm-lib/src/cache.rs` — `add_or_update_cards`
- `wasm-lib/src/lib.rs` — WASM-экспорт
