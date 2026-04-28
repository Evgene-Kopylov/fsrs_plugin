# Задача 1.2: Модификация FsrsTableRenderer

## Файл

`src/ui/fsrs-table-renderer.ts`

## Что изменить

Изменить логику загрузки в `renderContent()`:

- Вместо вызова `getCachedCardsWithState()` запустить прогрессивное сканирование.
- Если кэш уже есть (`this.cachedCardsWithState` не null) — использовать его (как сейчас).
- Если первый раз — показать спиннер, вызвать `startProgressiveScan`.
- При первом чанке — отрендерить таблицу с тем, что есть (передать в `generateTableDOM`).
- При последующих чанках — обновить `this.cachedCardsWithState`, пересортировать (если есть `params.sort`) и перерисовать таблицу (заменой содержимого).
- После завершения (или досрочной остановки) — финальный рендер.

## Детали реализации

- Хранить `progressiveScanCancel: (() => void) | null`.
- В `onunload` вызывать `progressiveScanCancel?.()`.
- Обновление таблицы делать через `this.refresh()` с флагом `forceRefresh = false`, чтобы не сбрасывать кэш, а перерисовать из текущих данных.
- Добавить метод `updateTableFromCache()`, который перерисовывает таблицу из `this.cachedCardsWithState` и `this.params` (аналог `renderFromCache`, но без вызова WASM).

## Зависимости

- [ ] `canks-1.1.progressive-scan-cache.md` — метод `startProgressiveScan` в `IncrementalCache`

## Критерий готовности

При открытии заметки с `fsrs-table` появляется спиннер, затем таблица с первыми доступными данными, которая дополняется по мере сканирования чанков. После завершения сканирования спиннер исчезает.