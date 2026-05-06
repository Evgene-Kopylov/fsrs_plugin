# WHERE file — совпадение по имени, а не полному пути

## Проблема

`WHERE file = "имя"` делает точное сравнение с полным путём (`папка/имя.md`). Пользователь ожидает что фильтр сработает по имени файла без расширения и пути.

См. инцидент: [where-file-exact-match.md](../incidents/where-file-exact-match.md)

## Решение

Поле `file` в `CardWithComputedFields` должно возвращать стем — имя файла без пути и `.md`.

**Изменение:** `calculator.rs:compute_fields_from_state` — вместо `file: card.file_path.clone()` извлекается `Path::file_stem()`.

```rust
file: card.file_path.as_ref().map(|p| {
    std::path::Path::new(p)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}),
```

## Точки воздействия

- `wasm-lib/src/table_processing/filtering/calculator.rs` — единственное место заполнения `CardWithComputedFields.file`.
- `wasm-lib/src/table_processing/filtering/evaluator.rs` — сравнение `file` как строки (без изменений).
- `wasm-lib/src/table_processing/filtering/mod.rs` — сортировка по `file` (без изменений).
- TS: `card.filePath` остаётся полным путём для навигации, `computed_fields.file` — только для WHERE/ORDER BY.

## Возникшие проблемы

### 1. Ложно-отрицательный результат

Логи: `totalCount: 102` без WHERE, `totalCount: 0` с `WHERE file = "..."`.
Причина: `file` содержал полный путь (`папка/имя.md`), а не стем.

### 2. Отладка вслепую

`log::debug!` в WASM не выводит ничего (нет инициализации wasm-logger).
Добавлен `#[wasm_bindgen] extern "C" { fn console_log(s: &str); }` — **подтвердил**, что после фикса `card.file` = стем:
```
WHERE file: card.file='FSRS table', compare with='STEND'
WHERE file: card.file='_Welcome', compare with='STEND'
WHERE file: card.file='🌙 Silky Panda Imagining 22 🐝', compare with='STEND'
```

Вывод: стем извлекается правильно. `'STEND'` не совпадает ни с одной карточкой — 0 результатов可能是因为 такого файла нет в кэше.

### 3. Гипотеза о пустом кэше — опровергнута

После hot reload плагина `ensureCacheScanned` перезапускает сканирование, `totalCount: 102` подтверждает данные.

### 4. Неподтверждённая гипотеза: расхождение TS→WASM

Проверено — `add_or_update_cards_js` корректно проставляет `card.file_path`.
Различий между тестовым путём (`add_or_update_cards`, JSON) и боевым (`add_or_update_cards_js`, JsValue) не найдено.

## Текущий статус

- [x] Исправление в `calculator.rs` (стем из `Path::file_stem()`)
- [x] Интеграционные тесты в `cache.rs` (полный SQL-парсинг + query_cards)
- [x] 176 тестов проходят
- [x] Консоль-лог в Obsidian подтверждает стемы
- [x] `main.ts`: убран пропуск `reviews.length === 0` — карточки с пустыми reviews попадают в кэш
- [x] `WHERE file = "STEND"` находит (reviews: [])
- [x] `WHERE file = "Untitled 1"` находит (с повторениями)

## Гипотезы — подтверждены/опровергнуты

1. **Файла нет в кэше** ✅ подтверждено: `STEND.md` имел `reviews: []` и пропускался сканером. Исправлено.
2. **Юникод-нормализация** — не проверялась, проблема не в ней.
3. **Регистр** — сравнение точное, байтовое. Не было причиной.
4. **Другая часть WHERE** — не была причиной.

## Планы

- [ ] Снять консоль-лог для конкретного имени файла, которое ожидает пользователь (не STEND)
- [ ] Проверить юникод-нормализацию: сравнить байты `Path::file_stem()` и значения из парсера
- [ ] Обновить тестовые данные evaluator: `file: Some("test.md")` → `file: Some("test")`
- [ ] `LIKE` — отдельная таска: [like-operator.md](like-operator.md)
