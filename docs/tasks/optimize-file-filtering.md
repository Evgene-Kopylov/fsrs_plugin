# Оптимизация отсева файлов

Оптимизировать `shouldIgnoreFile` и убрать мёртвый код.

## Изменения

1. **`getAllIgnorePatterns`** — удалить (экспортируется, но нигде не используется)
2. **`shouldIgnoreFile`: для папок — `startsWith` перед `includes`**
   - Для корневых папок (`templates/`, `attachments/`, etc.) `startsWith` быстрее, чем `includes`
   - `includes` оставить как fallback для вложенных папок
3. ~~Убрать двойную проверку~~ — отменено.
   - `on("modify")` проверяет ДО `scheduleCardScan` — предотвращает лишнее планирование
   - `scanSingleCard` проверяет для `on("rename")`, где нет предварительной проверки
   - Обе нужны, убирать нельзя

## Мотивация

- `includes()` сканирует всю строку — дороже `startsWith`
- Большинство игнорируемых папок — корневые (`templates/`, `attachments/` и т.д.)
- Расширения (`.canvas`, `.excalidraw.md`) проверяются через `endsWith` — быстрее, поэтому перенесены первыми
- `getAllIgnorePatterns` — мёртвый код, не используется нигде

## Проверка

- Тесты `shouldIgnoreFile` проходят
- Сборка без ошибок
- Игнор-список работает как раньше (templates, attachments, .obsidian и т.д.)
