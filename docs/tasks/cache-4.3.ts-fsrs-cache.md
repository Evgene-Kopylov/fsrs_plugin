# cache-4.3.ts-fsrs-cache.md

## Задача: создать класс `FsrsCache` в TypeScript

Создать тонкую обёртку над WASM-функциями кэша. Класс `FsrsCache` будет вызывать `init_cache`, `add_or_update_cards`, `remove_card`, `query_cards` и другие из WASM-модуля. Не хранит состояние карточек в TS — только вызывает WASM.

## Что нужно сделать

### 1. Создать файл `src/utils/fsrs/fsrs-cache.ts`

Новый класс `FsrsCache`:

```typescript
import type { ModernFSRSCard, ComputedCardState, CachedCard } from "../../interfaces/fsrs";
import type { TableParams } from "../fsrs-table-helpers";

// Тип входного элемента для addOrUpdateCards
export interface CacheCardInput {
    filePath: string;
    card: ModernFSRSCard;
    state: ComputedCardState;
}

// Тип результата query_cards из WASM
export interface QueryResult {
    cards: CachedCard[];
    total_count: number;
    errors: string[];
}

// Тип результата query_cards_count
export interface CountResult {
    total_count: number;
    errors: string[];
}

export class FsrsCache {
    /**
     * Инициализирует/очищает кэш в WASM
     */
    init(): void {
        wasm.init_cache();
    }

    /**
     * Полностью очищает кэш
     */
    clear(): void {
        wasm.clear_cache();
    }

    /**
     * Пакетное добавление или обновление карточек
     */
    async addOrUpdateCards(cards: CacheCardInput[]): Promise<{ updated: number; errors: string[] }> {
        const json = JSON.stringify(
            cards.map(c => ({
                filePath: c.filePath,
                card_json: JSON.stringify({ reviews: c.card.reviews }),
                state_json: JSON.stringify(c.state),
            }))
        );
        const resultJson = wasm.add_or_update_cards(json);
        return JSON.parse(resultJson);
    }

    /**
     * Удаляет карточку из кэша по пути файла
     */
    removeCard(filePath: string): { removed: boolean; reason?: string } {
        const resultJson = wasm.remove_card(filePath);
        return JSON.parse(resultJson);
    }

    /**
     * Запрашивает карточки с фильтрацией/сортировкой/лимитом
     */
    query(params: TableParams, now: Date): QueryResult {
        const resultJson = wasm.query_cards(JSON.stringify(params), now.toISOString());
        return JSON.parse(resultJson);
    }

    /**
     * Запрашивает только количество карточек по параметрам (быстрее)
     */
    queryCount(params: TableParams, now: Date): CountResult {
        const resultJson = wasm.query_cards_count(JSON.stringify(params), now.toISOString());
        return JSON.parse(resultJson);
    }

    /**
     * Возвращает количество карточек в кэше
     */
    size(): number {
        return wasm.get_cache_size();
    }

    /**
     * Возвращает все карточки из кэша (для отладки)
     */
    getAll(): CachedCard[] {
        const resultJson = wasm.get_all_cards();
        return JSON.parse(resultJson);
    }
}
```

### 2. Экспортировать класс из `src/utils/fsrs/index.ts`

```typescript
export { FsrsCache } from "./fsrs-cache";
```

### 3. Убедиться, что все WASM-функции, используемые `FsrsCache`, доступны

Проверить, что в WASM-модуле (из `wasm-lib`) экспортируются:
- `init_cache` — ✅ (сделано в cache-4.1)
- `clear_cache` — ✅ (сделано в cache-4.1)
- `add_or_update_cards` — ✅ (сделано в cache-4.1)
- `remove_card` — ✅ (сделано в cache-4.1)
- `query_cards` — ✅ (сделано в cache-4.2)
- `query_cards_count` — ✅ (сделано в cache-4.2)
- `get_cache_size` — ✅ (сделано в cache-4.1)
- `get_all_cards` — ✅ (сделано в cache-4.1)

### 4. Сборка

```bash
npm run build
```

## Критерии готовности

- [ ] Создан `src/utils/fsrs/fsrs-cache.ts` с классом `FsrsCache`
- [ ] Все методы вызывают соответствующие WASM-функции
- [ ] `FsrsCache` экспортируется из `src/utils/fsrs/index.ts`
- [ ] `npm run build` проходит успешно

## Примечания

- `FsrsCache` **не хранит** состояние — только вызывает WASM
- Все данные возвращаются в виде сырых JS-объектов из JSON
- `addOrUpdateCards` принимает массив для пакетной обработки (чанки по 500)
- `removeCard` используется при удалении и переименовании файлов
- `query` и `queryCount` — основные методы для рендереров таблиц