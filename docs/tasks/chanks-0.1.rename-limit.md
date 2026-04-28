## 0.1. Переименовать константу `LIMIT` отображения

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
