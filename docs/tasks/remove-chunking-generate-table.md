# Убрать чанкование из generateTableDOM

**Проблема:**

В `generateTableDOM()` в `fsrs-table-generator.ts` генерация строк таблицы разбивается на чанки по 50 с `await new Promise(resolve => setTimeout(resolve, 0))` между ними. На практике оптимизация оказалась бесполезной.

**Задача:**

- Убрать `CHUNK_SIZE` и цикл по чанкам — генерировать все строки таблицы в одном проходе.
- Убрать `await new Promise(resolve => setTimeout(resolve, 0))`.
- `generateTableDOM` перестаёт быть асинхронной (убрать `async` из сигнатуры).
- Убрать `await` перед вызовом `generateTableDOM` в `fsrs-table-renderer.ts`.