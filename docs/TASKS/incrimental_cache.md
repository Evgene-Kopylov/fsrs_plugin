**Задача для агента: Инкрементальный кэш карточек FSRS**

## Цель
Заменить полное сканирование хранилища при каждом изменении на точечное обновление кэша.  
Хранилище: `Map<string, CachedCard>`.  
При изменении файла – пересчитывать только его.  
Добавить debounce 500 мс для `modify`.

## Файл для изменений
`src/main.ts`

## Конкретные шаги

### 1. Замена структуры кэша
Удалить:
```ts
private cachedCardsWithState: CachedCard[] | null = null;
private scanPromise: Promise<CachedCard[]> | null = null;
```

Добавить:
```ts
private cardCache = new Map<string, CachedCard>();
private cacheInitialized = false;
private scanPromise: Promise<void> | null = null;
private pendingUpdates = new Map<string, NodeJS.Timeout>();
```

### 2. Метод `initializeCache()`
- Выполняет полное сканирование (как `performFullScan`), но заполняет `cardCache`.
- Устанавливает `cacheInitialized = true`.
- Использует `scanPromise` для предотвращения параллельных сканов.

### 3. Метод `performFullScan(): Promise<void>`
- Переписать: вместо возврата массива заполняет `this.cardCache`.
- Удалить `return cards;` (ничего не возвращает).
- Логирование количества найденных карточек.

### 4. Метод `updateCard(filePath: string): Promise<void>`
- Проверяет игнорирование (`shouldIgnoreFileWithSettings`).
- Читает файл, парсит frontmatter, вычисляет состояние.
- Если валидная карточка – обновляет `cardCache.set()`.
- Если нет (не FSRS или ошибка) – удаляет из `cardCache`.
- После изменения вызывает `this.notifyFsrsTableRenderers()`.

### 5. Метод `scheduleCardUpdate(filePath: string)`
- Debounce 500 мс: отменяет существующий таймер для этого файла, создаёт новый.
- По истечении вызывает `updateCard(filePath)`.

### 6. Обработчики событий (в `onload`)
Заменить существующий `fileModifyHandler` на:

```ts
this.registerEvent(this.app.vault.on("modify", (file) => {
    if (file.path) this.scheduleCardUpdate(file.path);
}));
this.registerEvent(this.app.vault.on("delete", (file) => {
    if (this.cardCache.has(file.path)) {
        this.cardCache.delete(file.path);
        this.notifyFsrsTableRenderers();
    }
}));
this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
    if (this.cardCache.has(oldPath)) {
        const entry = this.cardCache.get(oldPath)!;
        this.cardCache.delete(oldPath);
        const newCard = { ...entry.card, filePath: file.path };
        this.cardCache.set(file.path, { card: newCard, state: entry.state });
        this.notifyFsrsTableRenderers();
    } else {
        this.scheduleCardUpdate(file.path);
    }
}));
```

### 7. Метод `getCachedCardsWithState()`
```ts
async getCachedCardsWithState(): Promise<CachedCard[]> {
    if (!this.cacheInitialized) {
        await this.initializeCache();
    }
    return Array.from(this.cardCache.values());
}
```

### 8. Метод `invalidateCache()`
```ts
private invalidateCache(): void {
    this.cardCache.clear();
    this.cacheInitialized = false;
    this.scanPromise = null;
    // Очищаем все pending таймеры
    for (const timer of this.pendingUpdates.values()) clearTimeout(timer);
    this.pendingUpdates.clear();
    this.notifyFsrsTableRenderers();
}
```

### 9. Очистка в `onunload`
```ts
for (const timer of this.pendingUpdates.values()) clearTimeout(timer);
this.pendingUpdates.clear();
```

### 10. Удалить старый код
- Удалить `private fileModifyHandler`.
- Удалить строку `this.app.vault.on("modify", this.fileModifyHandler);` (заменена на новые обработчики).

## Проверка после реализации
- Плагин собирается без ошибок (`npm run build`).
- `npm run test`
- `cd wasm-lib; cargo test`
- При первом вызове таблицы – полное сканирование (один раз).
- При изменении карточки – таблица обновляется через ~500 мс.
- При быстром редактировании одного файла – только последнее изменение вызывает пересчёт.
- Переименование/удаление файла корректно обновляет кэш.
- Изменение настроек игнорирования – кэш перестраивается при следующем вызове.

## Ожидаемый результат
Производительность при 10k карточек:  
- Инициализация ~5-7 секунд (один раз).  
- Каждое изменение одной карточки – ~5-10 мс + debounce 500 мс.  
- Таблица рендерится мгновенно из кэша.
