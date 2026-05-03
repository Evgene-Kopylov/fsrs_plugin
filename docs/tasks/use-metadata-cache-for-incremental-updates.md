# Использовать metadataCache Obsidian для инкрементальных обновлений вместо vault.read()

## Проблема

При изменении файла (`vault.on("modify")`) `scanSingleCard` делает `vault.read(file)` — читает файл с диска и заново парсит frontmatter. Это избыточно: Obsidian уже закешировал frontmatter.

При полном сканировании (`performCacheScanAsync`) файлы не читаются — используется `metadataCache.getFileCache(file)`. Инкрементальное обновление должно работать так же.

## Решение

Подписаться на `metadataCache.on("changed", (file) => ...)` вместо `vault.on("modify")` и использовать `metadataCache.getFileCache(file)` — без `vault.read()`.

## Ожидаемый эффект

- Ускорение инкрементальных обновлений (не читать файл с диска)
- Единообразие: полное сканирование и инкрементальные обновления работают через metadataCache

## Файлы

- `src/main.ts` — `onload()`, `scanSingleCard()`, `scheduleCardScan()`
