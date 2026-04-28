# notifyFsrsTableRenderers: убрать debounce

**Статус:** в работе

## Проблема

После просмотра карточки (нажатия rating) таблица `fsrs-table` обновляется с задержкой ~500 мс. 

Причина: `notifyFsrsTableRenderers()` использует `setTimeout` с `RENDERER_DEBOUNCE_MS = 500` перед вызовом `refresh()` у всех рендереров. Debounce срабатывает даже при одиночном изменении, добавляя искусственную задержку.

Цепочка при просмотре карточки:
1. `reviewCardByFile()` → модифицирует файл → событие `modify`
2. `scheduleCardScan(filePath)` → 500 мс debounce → `scanSingleCard()`
3. `scanSingleCard()` → `addOrUpdateCards` + `notifyFsrsTableRenderers()`
4. `notifyFsrsTableRenderers()` → 500 мс debounce → `refresh()` для всех рендереров

Итого: 500 мс (scheduleCardScan) + 500 мс (notifyFsrsTableRenderers) = до 1 с задержки.

Кроме того, плагин может вызывать `notifyFsrsTableRenderers()` сразу после обновления кэша (например, из команд review, delete, add-fields), и 500 мс debounce там тоже избыточен.

## Почему debounce не нужен

`FsrsTableRenderer.renderContent()` уже защищён флагом `isRendering` — параллельные вызовы игнорируются. При массовых изменениях (batch-сканирование) рендер не задваивается.

## План

1. Удалить `RENDERER_DEBOUNCE_MS` из `constants.ts` (если нигде больше не используется).
2. В `notifyFsrsTableRenderers()` убрать `setTimeout` и вызывать `renderer.refresh()` немедленно.
3. Собрать (`npm run build`).
4. Протестировать: просмотр карточки → таблица обновляется без заметной задержки.