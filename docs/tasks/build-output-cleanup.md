# Уборка вывода сборки

**Проблемы:**
1. **Билд при билде** — `npm run build` пересобирает WASM (`predev`), хотя должен только собирать сам плагин. WASM уже собран или собирается отдельно на CI. Нужно переделать `build` на `build:skip-wasm`.
2. **Длинное сообщение** — `scripts/encode-wasm.js` выводит 5 строк в консоль. Сократить до одной (или убрать совсем).
3. **Двойной лог** — esbuild с `logLevel: "info"` даёт слишком подробный вывод. Нужно понизить до `warning`.

**Что сделать:**
- В `package.json` заменить `"build": "tsc -noEmit -skipLibCheck && npm run predev && node esbuild.config.mjs production"` на `"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"` (или просто использовать `npm run build:skip-wasm`)
- В `scripts/encode-wasm.js` заменить 5 console.log на одну короткую строку или убрать совсем
- В `esbuild.config.mjs` заменить `logLevel: "info"` на `logLevel: "warning"`
