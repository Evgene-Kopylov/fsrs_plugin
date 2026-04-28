# cache-4.4.integration.md

## Задача: интеграция FsrsCache в main.ts, замена IncrementalCache

Заменить `IncrementalCache` на новый `FsrsCache` в `main.ts`. Весь процесс сканирования, обработки событий файловой системы и управления кэшем переписывается для работы через WASM-кэш.

## Что нужно сделать

### 1. Заменить `IncrementalCache` на `FsrsCache` в `main.ts`

Удалить:
```typescript
import { IncrementalCache } from "./utils/fsrs";
// ...
private cardCache!: IncrementalCache;
```

Добавить:
```typescript
import { FsrsCache, CacheCardInput } from "./utils/fsrs/fsrs-cache";
// ...
public cache!: FsrsCache;
```

### 2. Инициализация кэша

В `onload()`, после инициализации WASM:
```typescript
// Инициализация кэша в WASM
this.cache = new FsrsCache();
this.cache.init();
```

### 3. Прогрессивное сканирование

Заменить `performFullScan` из `IncrementalCache` на новый метод в `main.ts` (или в отдельном файле `src/utils/fsrs-scanning.ts`):

```typescript
async performCacheScan(onProgress?: (current: number, total: number) => void): Promise<void> {
    const start = performance.now();
    let files = this.app.vault.getMarkdownFiles();
    files = files.sort((a, b) => a.path.localeCompare(b.path));
    
    // Очищаем кэш перед сканированием
    this.cache.clear();
    
    let brokenCount = 0;
    const CHUNK_SIZE = 100;
    
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        const batch: CacheCardInput[] = [];
        
        for (const file of chunk) {
            if (shouldIgnoreFileWithSettings(file.path, this.settings, this.app.vault.configDir))
                continue;
            try {
                const content = await this.app.vault.read(file);
                const frontmatter = extractFrontmatter(content);
                if (!frontmatter) continue;
                const parseResult = parseModernFsrsFromFrontmatter(frontmatter, file.path);
                if (parseResult.success && parseResult.card) {
                    const state = computeCardState(parseResult.card, this.settings);
                    batch.push({ filePath: file.path, card: parseResult.card, state });
                } else {
                    brokenCount++;
                }
            } catch {
                brokenCount++;
            }
        }
        
        // Отправляем чанк в WASM
        if (batch.length > 0) {
            const result = await this.cache.addOrUpdateCards(batch);
            if (result.errors.length > 0) {
                verboseLog(`Ошибки при добавлении карточек: ${result.errors.join(", ")}`);
            }
        }
        
        // Прогресс
        onProgress?.(Math.min(i + CHUNK_SIZE, files.length), files.length);
        
        // Отдаём управление браузеру
        await new Promise((resolve) => activeWindow.setTimeout(resolve, 0));
    }
    
    verboseLog(`✅ Найдено карточек FSRS: ${this.cache.size()}`);
    if (brokenCount > 0) {
        verboseLog(`⚠️ Пропущено битых карточек: ${brokenCount}`);
    }
    const elapsed = (performance.now() - start) / 1000;
    verboseLog(`⏱️ Сканирование всего хранилища: ${elapsed.toFixed(2)} с`);
}
```

### 4. Обработка событий файловой системы

Заменить обработчики в `onload()`:

```typescript
// Удаление файла
this.registerEvent(
    this.app.vault.on("delete", (file) => {
        this.cache.removeCard(file.path);
        this.notifyFsrsTableRenderers();
    }),
);

// Переименование файла
this.registerEvent(
    this.app.vault.on("rename", (file, oldPath) => {
        this.cache.removeCard(oldPath);
        this.notifyFsrsTableRenderers();
        // Планируем обновление для нового пути (с debounce)
        this.scheduleCardScan(file.path);
    }),
);

// Модификация файла (debounce 500 мс)
this.registerEvent(
    this.app.vault.on("modify", (file) => {
        this.scheduleCardScan(file.path);
    }),
);
```

### 5. Debounce для modify

Добавить в `main.ts`:

```typescript
private pendingScans = new Map<string, number>();

private scheduleCardScan(filePath: string): void {
    const existing = this.pendingScans.get(filePath);
    if (existing) activeWindow.clearTimeout(existing);
    
    const timer = activeWindow.setTimeout(() => {
        void this.scanSingleCard(filePath);
        this.pendingScans.delete(filePath);
    }, 500);
    
    this.pendingScans.set(filePath, timer);
}

private async scanSingleCard(filePath: string): Promise<void> {
    if (shouldIgnoreFileWithSettings(filePath, this.settings, this.app.vault.configDir)) {
        this.cache.removeCard(filePath);
        this.notifyFsrsTableRenderers();
        return;
    }
    
    try {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) return;
        
        const content = await this.app.vault.read(file);
        const frontmatter = extractFrontmatter(content);
        if (!frontmatter) {
            this.cache.removeCard(filePath);
            this.notifyFsrsTableRenderers();
            return;
        }
        
        const parseResult = parseModernFsrsFromFrontmatter(frontmatter, filePath);
        if (parseResult.success && parseResult.card) {
            const state = computeCardState(parseResult.card, this.settings);
            await this.cache.addOrUpdateCards([{ filePath, card: parseResult.card, state }]);
            this.notifyFsrsTableRenderers();
        } else {
            this.cache.removeCard(filePath);
            this.notifyFsrsTableRenderers();
        }
    } catch (error) {
        console.warn(`Ошибка при сканировании карточки ${filePath}:`, error);
        this.cache.removeCard(filePath);
        this.notifyFsrsTableRenderers();
    }
}
```

### 6. Обновить метод `getCachedCardsWithState`

Заменить на прямой вызов `query_cards`:

```typescript
// В main.ts
async getCachedCardsWithState(): Promise<CachedCard[]> {
    // Возвращаем все карточки без фильтрации (для совместимости)
    const defaultParams: TableParams = {
        columns: [{ field: "file", title: "File", width: undefined }],
        limit: 0,
        sort: undefined,
        where_condition: undefined,
    };
    const result = this.cache.query(defaultParams, new Date());
    return result.cards;
}
```

### 7. Обновить `findCardsForReview`

Команда `find-fsrs-cards` должна использовать `query_cards` с параметрами по умолчанию (сортировка по due, лимит из настроек).

### 8. Очистка в `onunload()`

```typescript
onunload() {
    // Очищаем pending таймеры
    for (const timer of this.pendingScans.values())
        activeWindow.clearTimeout(timer);
    this.pendingScans.clear();
    
    // Очищаем кэш в WASM
    this.cache?.clear();
    // ... остальная очистка
}
```

### 9. Сборка

```bash
npm run build
```

## Критерии готовности

- [ ] `IncrementalCache` полностью заменён на `FsrsCache`
- [ ] Прогрессивное сканирование с чанками (100 файлов) работает через `addOrUpdateCards`
- [ ] События файловой системы (modify/delete/rename) обрабатываются через WASM-кэш
- [ ] Debounce (500 мс) для modify работает
- [ ] `getCachedCardsWithState` использует `query_cards`
- [ ] `npm run build` проходит успешно

## Примечания

- Логика сканирования (чтение файлов, парсинг frontmatter) остаётся в TS — это её зона ответственности
- WASM только хранит кэш и выполняет запросы
- Debounce — чисто TS-концепция, связанная с событиями файловой системы Obsidian
- `onProgress` колбэк можно будет использовать для индикатора загрузки в UI