# cache-4.5.renderer-update.md

## Задача: обновить FsrsTableRenderer — убрать статический кэш, использовать query_cards

Упростить `FsrsTableRenderer`: удалить статический кэш `rendererCache`, логику ручного кэширования карточек и заменить на прямой вызов `plugin.cache.query()`.

## Что нужно сделать

### 1. Удалить статический кэш

Убрать из `src/ui/fsrs-table-renderer.ts`:

```typescript
private static rendererCache = new Map<string, RendererCacheEntry>();
// и весь интерфейс RendererCacheEntry
```

### 2. Упростить `renderContent()`

Вместо многоуровневой логики с кэшированием:
- проверка `cachedCardsWithState`
- проверка `rendererCache`
- fallback на `plugin.getCachedCardsWithState()`

Сделать прямой вызов:

```typescript
private async renderContent() {
    if (this.isRendering) return;
    this.isRendering = true;
    const start = performance.now();
    
    try {
        this.container.removeClass("fsrs-table-error");
        const codeBlockParent = this.container.closest(
            ".block-language-fsrs-table, .cm-preview-code-block.block-language-fsrs-table, .cm-embed-block.block-language-fsrs-table",
        );
        if (codeBlockParent) codeBlockParent.removeClass("fsrs-table-error");
        
        if (this.isFirstLoad) {
            this.showLoadingIndicator();
        } else {
            this.container.classList.add("fsrs-table-loading");
        }
        
        // Парсим SQL блок (если ещё не спарсено)
        if (!this.params) {
            const { parseSqlBlock } = await import("../utils/fsrs-table-params");
            this.params = parseSqlBlock(this.sourceText);
        }
        
        const now = new Date();
        
        // Прямой запрос к WASM-кэшу — без промежуточного кэширования в TS
        const result = this.plugin.cache.query(this.params, now);
        
        if (result.cards.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        // Генерируем DOM таблицы из результата
        await generateTableDOM(
            this.container,
            result.cards,
            result.total_count,
            this.params,
            this.plugin.settings,
            this.plugin.app,
            now,
        );
        
        // Сохраняем позицию прокрутки
        const scrollContainer = this.container.querySelector(".fsrs-table-container");
        const savedScrollLeft = scrollContainer?.scrollLeft ?? 0;
        const newScrollContainer = this.container.querySelector(".fsrs-table-container");
        if (newScrollContainer && savedScrollLeft > 0) {
            newScrollContainer.scrollLeft = savedScrollLeft;
        }
        
        this.addEventListeners();
        
        if (!this.isFirstLoad) {
            this.container.classList.remove("fsrs-table-loading");
        }
        
        this.lastVisibilityUpdate = Date.now();
    } catch (error) {
        this.renderErrorState(error);
    } finally {
        const elapsedMs = performance.now() - start;
        const elapsedSec = elapsedMs / 1000;
        verboseLog(`⏱️ Загрузка таблицы FSRS: ${elapsedSec.toFixed(2)} с`);
        this.isRendering = false;
    }
}
```

### 3. Упростить `refresh()` — убрать forceRefresh

```typescript
async refresh() {
    this.lastAction = "refresh";
    await this.renderContent();
    this.lastAction = null;
}
```

Кэш теперь в WASM, так что не нужно ничего сбрасывать.

### 4. Упростить `handleSortClick()`

Сортировка теперь делается через WASM-кэш:

```typescript
private async handleSortClick(field: string) {
    if (!this.params) return;
    
    const nextDirection = getNextSortDirection(this.params.sort, field);
    
    if (nextDirection === null) {
        delete this.params.sort;
    } else {
        this.params.sort = { field, direction: nextDirection };
    }
    
    this.lastAction = "sort";
    await this.renderContent();
}
```

Не нужно хранить `cachedCardsWithState`, `originalCardsWithState`, и не нужна локальная сортировка `sortCards`.

### 5. Удалить ненужные поля класса

Убрать:
- `private static rendererCache`
- `private cachedCardsWithState: CardWithState[] | null`
- `private cachedTotalCount: number`
- `private originalCardsWithState: CardWithState[] | null`
- `private lastAction: "sort" | "refresh" | null`

Оставить:
- `private params: TableParams | null`
- `private isFirstLoad: boolean`
- `private isRendering: boolean`
- `private sourceText: string`

### 6. Удалить `renderFromCache()`

Метод больше не нужен, так как вся сортировка и фильтрация — в WASM.

### 7. Обновить `onunload()`

Убрать `FsrsTableRenderer.rendererCache.delete(this.sourcePath)` — статический кэш удалён.

### 8. Проверить импорты

Убрать импорт `sortCards`, `getNextSortDirection` (если не используются). Оставить только те, что реально нужны.

### 9. Сборка

```bash
npm run build
```

## Критерии готовности

- [ ] Удалён `static rendererCache`
- [ ] Удалены `cachedCardsWithState`, `cachedTotalCount`, `originalCardsWithState`, `lastAction`
- [ ] Удалён метод `renderFromCache()`
- [ ] `renderContent()` вызывает `plugin.cache.query()` напрямую
- [ ] `handleSortClick()` использует `query()` для сортировки
- [ ] Упрощён `refresh()` (без forceRefresh)
- [ ] Импорты приведены в порядок (нет лишних, нет сломанных)
- [ ] `npm run build` проходит успешно

## Примечания

- Статический кэш `rendererCache` был костылём для ускорения. Теперь кэш в WASM, и он быстрее
- `query_cards` в WASM уже включает фильтрацию, сортировку и лимит — не нужно дублировать в TS
- После этого обновления можно удалить `src/utils/fsrs/fsrs-table-sorter.ts` (сортировка в TS больше не нужна)