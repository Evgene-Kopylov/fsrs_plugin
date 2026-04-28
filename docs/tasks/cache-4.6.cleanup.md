# cache-4.6.cleanup.md

## Задача: удаление старого кода

После переноса кэша в Rust и обновления рендереров нужно удалить файлы, которые больше не используются.

## Что нужно сделать

### 1. Удалить `src/utils/fsrs/incremental-cache.ts`

Целиком удалить файл. `IncrementalCache` полностью заменён на `FsrsCache` + WASM-кэш.

### 2. Удалить `src/utils/fsrs/fsrs-table-sorter.ts` (если есть)

После обновления `FsrsTableRenderer` сортировка выполняется через `query_cards` в WASM. Локальная сортировка (`sortCards`, `getNextSortDirection`) больше не нужна.

Проверить, не импортируется ли `sortCards` или `getNextSortDirection` в других местах.

### 3. Проверить `src/utils/fsrs/fsrs-table-filter.ts`

Если `filterAndSortCards` или другие функции фильтрации использовались только `IncrementalCache` или рендерером — их можно удалить. Фильтрация теперь в `query_cards`.

Проверить импорты:
```bash
grep -r "fsrs-table-filter" src/
```

### 4. Проверить `src/utils/fsrs/fsrs-table-params.ts`

Модуль парсинга SQL-блоков (`parseSqlBlock`) всё ещё нужен — он вызывается в `FsrsTableRenderer`. **Не удалять.**

### 5. Проверить неиспользуемые интерфейсы в `src/interfaces/fsrs.ts`

Убрать `CachedCard`? Нет, он всё ещё используется как тип возвращаемого значения. Пока оставить.

Убрать `FSRSCard` — он мог использоваться старым кодом. Проверить.

### 6. Проверить импорты в `main.ts`

Удалить:
```typescript
import { IncrementalCache } from "./utils/fsrs";
```

### 7. Проверить импорты в `src/ui/fsrs-table-renderer.ts`

Удалить импорт:
```typescript
import { sortCards, getNextSortDirection } from "./fsrs-table-sorter";
```

### 8. Проверить экспорты в `src/utils/fsrs/index.ts`

Убрать экспорт `IncrementalCache`, если он там был. Добавить/проверить экспорт `FsrsCache`.

### 9. ESLint — проверка на мёртвый код

```bash
npx eslint ./src/
```

Убедиться, что нет ошибок `no-unused-vars` и `no-unused-imports`.

### 10. Сборка

```bash
npm run build
```

## Критерии готовности

- [ ] `incremental-cache.ts` удалён
- [ ] `fsrs-table-sorter.ts` удалён (если не используется)
- [ ] `fsrs-table-filter.ts` проверен и удалён (если не используется)
- [ ] Импорты в `main.ts` и `fsrs-table-renderer.ts` очищены
- [ ] `npm run build` проходит успешно
- [ ] ESLint не показывает ошибок неиспользуемых переменных/импортов

## Примечания

- Удаление файлов делаем через `git rm`, чтобы история сохранилась
- Перед удалением убедиться, что файл действительно не импортируется нигде
- ESLint можно запустить через `npx eslint ./src/`
- Если в проекте нет `eslint` конфига — просто проверить сборку TypeScript (tsc)