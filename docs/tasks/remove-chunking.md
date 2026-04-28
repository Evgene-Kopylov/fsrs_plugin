# Убрать чанкование из performCacheScan

**Проблема:**

В `performCacheScan()` в `main.ts` обработка файлов разбивается на чанки по 100 с `await new Promise(resolve => setTimeout(resolve, 0))` между ними. На практике оптимизация оказалась бесполезной.

**Задача:**

- Убрать `CHUNK_SIZE` и цикл по чанкам из `performCacheScan()` — обрабатывать все файлы в одном проходе.
- Убрать `await new Promise(resolve => setTimeout(resolve, 0))`.
- Убрать onProgress между чанками (оставить финальный вызов).