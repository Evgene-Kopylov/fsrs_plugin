# Оптимизация кэша: убрать предсериализованные JSON-строки

## Проблема

При загрузке таблицы `fsrs-table` происходит полный обход кэша (4964 записи).
Каждая итерация парсит `card_json` и `state_json` из строк обратно в структуры,
хотя эти же данные уже есть в `card: CardData` и `state: ComputedState`.

## Причина

`CachedCard` хранит дублирующие данные:

```rust
pub struct CachedCard {
    pub card: CardData,          // структура
    pub state: ComputedState,    // структура
    pub card_json: String,       // та же карточка, но JSON-строка
    pub state_json: String,      // то же состояние, но JSON-строка
}
```

`card_json` и `state_json` были добавлены, чтобы при запросе быстро отдавать
результат в TS (без повторной сериализации). Но на обходе кэша они же
замедляют — приходится парсить строки обратно.

## Решение

1. Убрать `card_json` и `state_json` из `CachedCard`
2. В `query_cards` сериализовать `card` и `state` только для результата
   (после LIMIT), а не для всего кэша
3. `CardInputItem` от TS оставить как есть — TS шлёт JSON-строки,
   `add_or_update_cards` парсит их в структуры

## Ожидаемый эффект

- Ускорение загрузки таблицы: 0.7–0.8 с → ?
- Меньше памяти на кэш (не хранить дублирующие строки)
- Проверить, не замедлит ли сериализация результата (200 строк — ничтожно)

## Файлы

- `wasm-lib/src/cache.rs` — `CachedCard`, `add_or_update_cards`, `query_cards`
- `wasm-lib/src/table_processing/filtering/mod.rs` — `filter_and_sort_cards_with_states`
