# Исправление 84 ESLint-варнингов no-unsafe-* на WASM-типах

## Проблема

CI/валидатор Obsidian показывает 84 предупреждения `no-unsafe-call`,
`no-unsafe-member-access`, `no-unsafe-argument`, `no-unsafe-assignment`,
`no-unsafe-return` — все в файлах, вызывающих WASM-функции.

Локально `tsc --noEmit` и `eslint src/` чисты.

## Причина

`wasm-pack` генерирует `wasm_lib.js` с директивой `@ts-self-types`:

```js
/* @ts-self-types="./wasm_lib.d.ts" */
```

Эта фича TypeScript 5.7+ создаёт неоднозначность: без `allowArbitraryExtensions`
TypeScript игнорирует директиву и резолвит `.d.ts` штатно, но CI-валидатор
Obsidian может разрешать иначе → все WASM-функции получают `any`.

`.d.ts` файл имеет корректные типы и резолвится TypeScript'ом стандартным путём
(приоритет `.d.ts` > `.js`). Директива `@ts-self-types` избыточна и вредна.

## Решение

Удалять `@ts-self-types` из `wasm_lib.js` на этапе сборки —
в скрипте `scripts/strip-wasm-fetch.js`, который уже модифицирует этот файл.

TypeScript в любой среде найдёт `wasm_lib.d.ts` стандартным разрешением
и получит корректные типы для всех WASM-функций.

## Изменения

- `scripts/strip-wasm-fetch.js` — удаление `@ts-self-types` после генерации
- `src/utils/fsrs/fsrs-parser.ts` — импорт без `.js` (единообразие)
