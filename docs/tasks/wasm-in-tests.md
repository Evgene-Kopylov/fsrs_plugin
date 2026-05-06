# WASM-модуль в тестах TypeScript

## Проблема

Сейчас тесты не могут импортировать WASM-модуль. Vitest (jsdom, Node.js) падает при попытке
выполнить `import * as wasm from "../../../wasm-lib/pkg/wasm_lib"` — внутренняя переменная
`wasm` в `wasm_lib.js` не инициализирована. В браузере Obsidian вызывает
`await init({ module_or_path: wasmBytes })`, но в тестах этого не происходит —
WASM-функции пытаются обратиться к неинициализированному модулю.

Из-за этого:

- **Ни одна функция с WASM не покрыта тестами**: `computeCardState`, `isCardDue`,
  `addReviewSession`, `getNewCardYaml`, `getCardYamlAfterReview`, `cardToFsrsYaml`,
  `FsrsCache`, парсинг SQL в `fsrs-table-params.ts`.
- Тесты вынуждены обходить WASM-импорты и проверять только pure-функции.
- Нет уверенности, что WASM-функции корректны при изменениях.

## Файлы с WASM-импортами

- `src/utils/fsrs/wasm-state.ts`
- `src/utils/fsrs/wasm-review.ts`
- `src/utils/fsrs/wasm-utils.ts`
- `src/utils/fsrs/fsrs-cache.ts`
- `src/utils/fsrs/fsrs-table-params.ts`

## Решение

В `tests/setup.ts` вызвать `initSync` до запуска тестов.

1. WASM уже встроен как base64-константа `WASM_BASE64` в `wasm-lib/pkg/wasm_lib_base64.ts`.
2. `wasm_lib.js` экспортирует `initSync(module)` — синхронную инициализацию (принимает
   `Uint8Array` с байтами `.wasm` или `WebAssembly.Module`).
3. В `tests/setup.ts` нужно:
   - Импортировать `initSync` из `wasm-lib/pkg/wasm_lib`
   - Импортировать `WASM_BASE64` из `wasm-lib/pkg/wasm_lib_base64`
   - Раскодировать base64 в `Uint8Array` и вызвать `initSync(wasmBytes)`

**Важно:** `base64ToBytes` сейчас лежит в `wasm-utils.ts`, который сам делает
`import * as wasm from "..."` — возникнет циклическая проблема. Нужно:
- Вынести `base64ToBytes` в отдельный pure-модуль (например, `src/utils/base64.ts`),
  а в `wasm-utils.ts` реэкспортировать или импортировать оттуда

### Ожидаемый результат

- `vitest` запускается без ошибок импорта WASM.
- Можно писать тесты, которые импортируют `wasm-state.ts`, `wasm-review.ts`,
  `wasm-utils.ts` и вызывают WASM-функции напрямую.
- Тесты для `FsrsCache` становятся возможны.

## Ограничения

- Без моков WASM (правила проекта запрещают моки внешних зависимостей).
- WASM должен загружаться один раз при старте тестов (в `setupFiles` или `globalSetup`).
- Сборка WASM (`wasm-pack build --target web`) должна предшествовать запуску тестов.

## Файлы

- `tests/setup.ts` — добавить вызов `initSync(WASM_BASE64)` до тестов
- `src/utils/base64.ts` — **новый** pure-модуль с `base64ToBytes` (вынесен из `wasm-utils.ts`)
- `src/utils/fsrs/wasm-utils.ts` — заменить inline `base64ToBytes` на импорт из `../base64`
- `src/main.ts` — обновить импорт `base64ToBytes` (если используется напрямую)
- `wasm-lib/pkg/wasm_lib.js` — wasm-bindgen JS-обвязка (уже есть, содержит `initSync`)
- `wasm-lib/pkg/wasm_lib_base64.ts` — base64-константа (уже есть)
