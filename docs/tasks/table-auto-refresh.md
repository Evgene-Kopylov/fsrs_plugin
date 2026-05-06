# Периодическое обновление цифр в таблице

## Проблема

Таблица `fsrs-table`, оставленная открытой на длительное время, показывает устаревшие значения: retrievability падает со временем, due-даты проходят, а цифры не меняются. Пользователь должен вручную переключаться на другую заметку и обратно.

## Решение

`setInterval` на `TABLE_AUTO_REFRESH_INTERVAL_SECONDS` (60 с), пока таблица видна. Без повторного сканирования — только `query_cards` по готовому кэшу (~0.06 с). Без перестройки DOM — только `textContent` изменившихся ячеек.

## Что сделано

- [x] Константа `TABLE_AUTO_REFRESH_INTERVAL_SECONDS` в `src/constants.ts`
- [x] `FsrsTableRenderer.startAutoRefresh()` — `setInterval` на 60 с
- [x] `FsrsTableRenderer.stopAutoRefresh()` — очистка при `onunload`
- [x] `FsrsTableRenderer.refreshValues()` — лёгкое обновление: `query_cards` → сопоставление по `filePath` → `formatFieldValue` → замена только если изменилось
- [x] Скрытая таблица (`offsetParent === null`) не обновляется
- [x] Колонка `file` (ссылка) пропускается
- [x] `date_format` колонок учитывается через `formatFieldValue`
