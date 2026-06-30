// Удаляет из wasm_lib.js функции __wbg_init и __wbg_load,
// которые содержат вызов fetch() для загрузки .wasm по сети.
// Плагин использует initSync с base64-WASM, поэтому эти функции — мёртвый код.
// Но их наличие в бандле триггерит автоматику стора Obsidian (network request check).
import fs from "fs";
import path from "path";

const wasmLibPath = path.resolve(process.cwd(), "wasm-lib/pkg/wasm_lib.js");

let content = fs.readFileSync(wasmLibPath, "utf-8");
const lines = content.split("\n");

// Сигнатуры функций, которые нужно удалить
const TO_REMOVE = [
    "async function __wbg_load(module, imports) {",
    "async function __wbg_init(module_or_path) {",
];

const toRemove = new Set();

for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (TO_REMOVE.includes(trimmed)) {
        toRemove.add(i);
        let depth = 1;
        for (let j = i + 1; j < lines.length && depth > 0; j++) {
            toRemove.add(j);
            for (const ch of lines[j]) {
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
            }
        }
    }
}

const filtered = lines.filter((_, i) => !toRemove.has(i));
content = filtered.join("\n");

// Убираем __wbg_init из финального export
content = content.replace(
    /export \{ initSync, __wbg_init as default \};/,
    "export { initSync };",
);

// Убираем @ts-self-types — директива создаёт неоднозначность
// для CI-валидаторов, а .d.ts и так резолвится стандартным путём
content = content.replace(
    /\/\* @ts-self-types=".\/wasm_lib\.d\.ts" \*\/\n?/,
    "",
);

fs.writeFileSync(wasmLibPath, content);
console.log("Removed __wbg_load and __wbg_init from wasm_lib.js");
