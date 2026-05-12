# Ленивая загрузка reviews в хитмапе

## Проблема

`get_heatmap_data` возвращает для каждой из 371 ячейки полный массив `reviews: [{file, path, rating}, ...]`. Это лишняя сериализация: reviews нужны только при hover, но грузятся всегда.

## Что нужно

Разделить на два вызова:

1. **`get_heatmap_data`** — лёгкий, только `count`, без `reviews`. Быстрая сериализация, быстрый рендер.
2. **`get_heatmap_reviews`** — все `reviews` сразу (ключ — дата). Вызывается при **первом hover**. Результат кэшируется в TS.

При первом наведении — микролаг (WASM + JSON), все последующие — мгновенные.

### Файлы

- `wasm-lib/src/cache.rs` — убрать `reviews` из `get_heatmap_data`, добавить `get_heatmap_reviews`
- `wasm-lib/src/lib.rs` — экспорт новой функции
- `src/utils/fsrs/fsrs-cache.ts` — методы `getHeatmapData` (без reviews) и `getHeatmapReviews`
- `src/ui/fsrs-heatmap-renderer.ts` — ленивый вызов `getHeatmapReviews` при первом hover, кэш в поле

### Критерий готовности

- `get_heatmap_data` не возвращает `reviews` — сериализация быстрее
- Первый hover вызывает `get_heatmap_reviews` один раз
- Второй и последующие hover — попап мгновенный, без вызова WASM
- Попап содержит тот же набор данных, что и сейчас
