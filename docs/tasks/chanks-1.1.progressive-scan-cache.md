## 1.1. Модификация `IncrementalCache` — прогрессивное сканирование

**Файл:** `src/utils/fsrs/incremental-cache.ts`

### Добавить метод `startProgressiveScan`

```ts
/**
 * Прогрессивно сканирует хранилище чанками, вызывает колбэки по мере нахождения карточек.
 * @param onChunk – вызывается после каждого чанка с массивом новых карточек (CachedCard[])
 * @param onComplete – вызывается по окончании сканирования или досрочной остановке
 * @param limitHint – подсказка, сколько карточек нужно для отображения (например, LIMIT * 2)
 * @returns функцию для досрочной остановки (cancel)
 */
async startProgressiveScan(
    onChunk: (newCards: CachedCard[]) => void,
    onComplete: () => void,
    limitHint: number
): Promise<() => void> {
    // 1. Если кэш уже инициализирован – сразу отдать все карточки и вызвать onComplete
    if (this.cacheInitialized) {
        const allCards = Array.from(this.cardCache.values());
        onChunk(allCards);
        onComplete();
        return () => {};
    }

    // 2. Если уже выполняется полное сканирование (this.scanPromise) – бросить ошибку
    if (this.scanPromise) {
        throw new Error("Полное сканирование уже выполняется");
    }

    const CHUNK_SIZE = 500; // можно вынести в constants
    let collectedCards: CachedCard[] = [];
    let stopRequested = false;
    let files = this.app.vault.getMarkdownFiles();
    files = files.sort((a, b) => a.path.localeCompare(b.path));

    const cancel = () => { stopRequested = true; };

    // Функция для проверки, нужно ли остановиться досрочно
    const shouldStop = () => stopRequested || collectedCards.length >= limitHint;

    for (let i = 0; i < files.length && !shouldStop(); i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        const newCards: CachedCard[] = [];

        for (const file of chunk) {
            if (shouldIgnoreFileWithSettings(/*...*/)) continue;
            const card = await this.processFile(file);
            if (card) {
                newCards.push(card);
                // Сохраняем в общий кэш
                this.cardCache.set(file.path, card);
            }
        }

        if (newCards.length > 0) {
            collectedCards = collectedCards.concat(newCards);
            onChunk(newCards);
        }

        // Отдаём управление браузеру
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    this.cacheInitialized = true;
    onComplete();
    return cancel;
}
```

### Сопутствующие изменения

- `processFile` – вынести из `performFullScan` отдельный метод, который читает файл, парсит, вычисляет состояние и возвращает `CachedCard | null`.
- `shouldIgnoreFileWithSettings` – уже есть в `fsrs-filter.ts`, импортировать.
- `CHUNK_SIZE` вынести в `constants.ts` при необходимости.

### Примечания

- Если сканирование уже идёт — возвращаем ошибку `"scan in progress"`. Рендерер должен её обработать.
- Параметр `limitHint` позволяет досрочно остановить сканирование, когда собрано достаточно карточек для заполнения таблицы.