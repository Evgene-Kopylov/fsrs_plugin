## Детальный план-инструкция

### Этап 0. Подготовительные рефакторинги (отдельные коммиты)

Эти изменения не влияют на логику, только на читаемость и ясность кода.  
Каждый пункт – отдельный коммит с сообщением на русском.

---

#### 0.1. Переименовать константу `LIMIT` отображения

**Проблема:**  
Сейчас в `generateTableDOM` (и в `TableParams.limit`) используется `limit` для ограничения **отображаемых** строк. Это не лимит выборки, а UI-ограничение. Название вводит в заблуждение.

**Решение:**  

1. В `constants.ts` добавить:
   ```ts
   /** Максимальное количество строк, отображаемых в таблице, если не указан LIMIT в SQL */
   export const DEFAULT_TABLE_DISPLAY_LIMIT = 200;
   ```

2. В `src/utils/fsrs-table-generator.ts` функцию `generateTableDOM` изменить:
   - Переменную `effectiveLimit` вычислять как `params.limit > 0 ? params.limit : DEFAULT_TABLE_DISPLAY_LIMIT`.
   - Удалить локальную константу `200`.

3. В `src/ui/fsrs-table-renderer.ts` в методе `renderContent` аналогично использовать `DEFAULT_TABLE_DISPLAY_LIMIT` для дефолтного лимита (хотя там уже используется из `generateTableDOM` – достаточно будет изменить в генераторе).

4. В `src/utils/fsrs-table-params.ts` тип `TableParams.limit` оставить как есть – это именно **лимит отображения**, переименовывать не нужно (breaking change для пользовательских блоков), но добавить комментарий.

**Коммит:** `refactor: переименован DEFAULT_TABLE_DISPLAY_LIMIT и вынесен в constants`

---

#### 0.2. Рефакторинг больших файлов (если будут затронуты)

Основные крупные файлы, которые могут потребовать разбиения:

- `src/utils/fsrs/incremental-cache.ts` (уже ~250 строк, после изменений может вырасти)
- `src/ui/fsrs-table-renderer.ts` (~300 строк)
- `src/utils/fsrs-table-generator.ts` (~150 строк, но может стать больше)

**Правило:** Если файл превышает 350 строк – разбить на модули по смыслу.  
Пока что ни один не превышает, но после добавления прогрессивного сканирования – следить. Если какой-то файл разросся – рефакторить **до** добавления новой логики, отдельным коммитом.

**Действия (если потребуется):**

- Вынести парсинг SQL в отдельный модуль (уже есть `fsrs-table-params.ts` – OK).
- Вынести рендеринг строк таблицы в отдельную функцию вне класса.
- В `incremental-cache.ts` вынести логику чанков в отдельный метод.

**Коммит (если были изменения):** `refactor: разбиение [имя файла] на модули`

---

### Этап 1. Реализация прогрессивного сканирования (основная задача)

#### 1.1. Модификация `IncrementalCache`

**Файл:** `src/utils/fsrs/incremental-cache.ts`

**Добавить:**

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

    // 2. Если уже выполняется полное сканирование (this.scanPromise) – подождать его, но вернуть чанками? 
    //    На первый раз лучше запретить параллельные вызовы – бросить ошибку или дождаться. Для простоты – если scanPromise есть, используем его результаты чанками (но это сложно). 
    //    Пока реализуем: если сканирование уже идёт – возвращаем ошибку "scan in progress". Пользователь (рендерер) должен обработать.

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

**Примечания:**  
- `processFile` – вынести из `performFullScan` отдельный метод, который читает файл, парсит, вычисляет состояние и возвращает `CachedCard | null`.
- `shouldIgnoreFileWithSettings` – уже есть в `fsrs-filter.ts`, импортировать.

---

#### 1.2. Модификация `FsrsTableRenderer`

**Файл:** `src/ui/fsrs-table-renderer.ts`

**Изменить логику загрузки:**

- В `renderContent()` вместо вызова `getCachedCardsWithState()` запустить прогрессивное сканирование.
- Если кэш уже есть (`this.cachedCardsWithState` не null) – использовать его (как сейчас).
- Если первый раз – показать спиннер, вызвать `startProgressiveScan`.
- При первом чанке – отрендерить таблицу с тем, что есть (передать в `generateTableDOM`).
- При последующих чанках – обновить `this.cachedCardsWithState`, пересортировать (если есть `params.sort`) и перерисовать таблицу (заменой содержимого).
- После завершения (или досрочной остановки) – финальный рендер.

**Детали:**

- Нужно хранить `progressiveScanCancel: (() => void) | null`.
- В `onunload` вызывать `progressiveScanCancel?.()`.
- Обновление таблицы делать через `this.refresh()` с флагом `forceRefresh = false`, чтобы не сбрасывать кэш, а перерисовать из текущих данных.
- Добавить метод `updateTableFromCache()`, который перерисовывает таблицу из `this.cachedCardsWithState` и `this.params` (аналог `renderFromCache`, но без вызова WASM).

---

#### 1.3. Адаптация `generateTableDOM` для работы с неполными данными

**Файл:** `src/utils/fsrs-table-generator.ts`

- Уже сейчас `generateTableDOM` принимает `cardsWithState` и отображает первые `limit` строк. Ничего менять не нужно, она уже работает с любым подмножеством.
- Единственное – нужно добавить сообщение внизу таблицы: *"Загружено X карточек, сканирование продолжается…"* (опционально). Это можно сделать через колбэк.

---

#### 1.4. Обработка досрочной остановки

- В `IncrementalCache.startProgressiveScan` параметр `limitHint` передавать как `(params.limit || DEFAULT_TABLE_DISPLAY_LIMIT) * 2`.
- Если в процессе сбора количество собранных карточек (после фильтрации WHERE) достигло `limitHint`, сканирование прерывается, вызывается `onComplete`.

**Важно:** Фильтрация WHERE должна применяться **до** подсчёта `collectedCards`. Для этого нужно вызывать WASM-функцию `filter_and_sort_cards` на каждом чанке? Это дорого. Лучше применить WHERE при добавлении каждой карточки:  
- Для каждой новой карточки проверяем через WASM `evaluate_condition`, подходит ли она под SQL условие.  
- Если подходит – добавляем в `collectedCards`, иначе – пропускаем.  
- Для проверки нужен доступ к `params.where_condition`. Этот объект должен быть передан в `startProgressiveScan`.

**Упрощение на первый раз:** не использовать WHERE для досрочной остановки. Просто собираем все карточки, пока не наберём `limitHint` **любых** карточек (без фильтрации по WHERE). Это менее точно, но проще. Потом можно доработать.

---

### 2. Тестирование и проверка

- **Ручное тестирование:**  
  1. Создать хранилище с 2000+ markdown-файлов, из которых ~200 имеют FSRS-поля.  
  2. Открыть заметку с `fsrs-table` (без `LIMIT` или с `LIMIT 20`).  
  3. Замерить время до появления таблицы (должно быть ~1-2 сек).  
  4. Убедиться, что после появления таблицы в фоне продолжают догружаться строки (если лимит не достигнут).  
  5. Проверить, что при повторном открытии таблица появляется мгновенно (кэш уже заполнен).

- **Модульное тестирование (в будущем):**  
  - Написать тест для `IncrementalCache.startProgressiveScan` с моками файловой системы.  
  - Пока можно без тестов, т.к. интеграция с Obsidian сложна.

---

### 3. Оформление результатов

- Каждый логический шаг (0.1, 0.2, 1.1, 1.2, 1.3, 1.4) – отдельный коммит с подробным сообщением.
- Задача считается выполненной, когда прогрессивное сканирование работает и время первого отображения таблицы сократилось с 10 секунд до <2 секунд на хранилище с 10k файлов (в разумных пределах).

---

Если согласен, агент может приступать к выполнению по этому плану.  
Нужны ли уточнения по какому-либо пункту?
