# Проверка и документирование лимитов выборки

## Как работают лимиты

### SQL-парсинг (Rust)

`LIMIT N` парсится в `parser.rs` функцией `parse_limit_clause()`.
Результат: `ParsedQuery.limit: usize` (0 = не указан).

### Передача в WASM (TS → Rust)

`toRustParams()` в `fsrs-cache.ts` передаёт `limit` как есть:

```typescript
const rustParams = {
    columns: params.columns,
    limit: params.limit,  // 0 = не указан → WASM не применяет лимит
};
```

### Фильтрация/сортировка/лимит (Rust) — полный пайплайн

`filter_and_sort_cards_with_states()` в `filtering/mod.rs`:

1. Все карточки из кэша (глобальный `Map<filePath, CachedCard>` в WASM)
2. **WHERE** — фильтрация по условию (удаление неподходящих)
3. **Сортировка** — по указанному полю и направлению (ASC/DESC)
4. `total_count = computed_cards.len()` (количество ДО лимита)
5. **LIMIT** — если `params.limit > 0 && params.limit < len` → `[0..limit]`
6. Вернуть `{ cards: limited, total_count, errors }`

**Порядок важен:** лимит применяется **после** сортировки, поэтому
сортируется полный набор, а LIMIT берёт первые N из отсортированного.

**Важно:** при `limit: 0` Rust возвращает ВСЕ карточки.

### Сортировка через клик по заголовку таблицы

`handleSortClick()` в `fsrs-table-renderer.ts`:

1. Меняет `params.sort` (поле + направление: ASC → DESC → none)
2. Вызывает `this.plugin.cache.query(this.params, now)`
3. WASM перезапрашивает **все** карточки, применяет WHERE, сортирует, лимитирует
4. Рендерер получает свежий отсортированный результат

**Сортируется весь набор карточек** (после WHERE), а не только отображённые.
LIMIT применяется после сортировки — корректно.

### Лимит демонстрации (инфо внизу таблицы)

Если `totalCards > cardsToShow.length`, под таблицей показывается сообщение:

> «Показано 20 из 150 (скрыто 130)»

Формируется в `generateTableDOM()` через `i18n.t("table.showing_limit")`.
`totalCards` = `result.total_count` из WASM (количество ДО лимита, после WHERE).
Это позволяет пользователю видеть полный размер выборки, даже если показана
только её часть.

### Отображение (TS)

`generateTableDOM()` в `fsrs-table-generator.ts`:

```typescript
const effectiveLimit = params.limit > 0 ? params.limit : DEFAULT_TABLE_DISPLAY_LIMIT;
const cardsToShow = cardsWithState.slice(0, effectiveLimit);
```

- Если LIMIT не указан → показать 200 (DEFAULT_TABLE_DISPLAY_LIMIT)
- Если `totalCards > cardsToShow.length` → инфо «Показано X из Y (скрыто Z)»

## Найденная проблема: неэффективная передача при LIMIT=0

При `LIMIT 0` (не указан):
1. Rust отдаёт **все** карточки (сериализация всех в JSON)
2. TS десериализует все
3. TS отображает только первые 200, остальные выбрасывает

Для хранилища с тысячами карточек — лишняя работа.

**Исправление:** в `toRustParams()` при `limit === 0` подставлять `DEFAULT_TABLE_DISPLAY_LIMIT` (200), чтобы Rust ограничивал выборку на своей стороне.

## Что проверить

- [ ] `npm run build` и `npm run test` проходят
- [ ] Таблица с `LIMIT 20` показывает 20 строк
- [ ] Таблица без LIMIT показывает 200 строк
- [ ] Инфо «Показано X из Y» корректно
- [ ] Сортировка + LIMIT работают вместе
- [ ] WHERE + LIMIT работают вместе
- [ ] `queryCount` не сломается (не используется нигде)
