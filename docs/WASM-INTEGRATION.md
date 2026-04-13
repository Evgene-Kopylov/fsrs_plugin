## Как интегрировать Rust + WASM в плагин Obsidian (рабочий метод)

### Что мы сделали
Мы добавили в плагин Obsidian вызов функции, написанной на Rust, скомпилированной в WebAssembly.  
WASM-код исполняется внутри плагина, результат отображается через `Notice`.  
Весь процесс обошёлся без `top-level await`, без глобальных переменных и без дополнительных сетевых запросов к `.wasm` файлу – бинарник встроен в плагин через base64.

### Итоговая архитектура
- **Rust-часть** – `wasm-lib/` с одной экспортируемой функцией `my_wasm_function`.
- **Сборка WASM** – `wasm-pack build --target web` (генерирует ES-модуль, подходящий для `import` в CommonJS-среде Obsidian).
- **Встраивание** – бинарный `.wasm` преобразуется в base64 и сохраняется как TypeScript-константа (`src/wasm_base64.ts`).
- **Загрузка** – в коде плагина base64 декодируется в `Uint8Array`, передаётся в `init({ module_or_path: bytes })`, после чего можно вызывать экспортированную функцию.
- **Сборка плагина** – `esbuild` собирает всё в `main.js` без специальных плагинов для WASM (массив `plugins` пуст).

### Как повторить для любого плагина Obsidian

#### 1. Создайте Rust-библиотеку внутри папки плагина
```bash
cargo new wasm-lib --lib
cd wasm-lib
```
**Cargo.toml**
```toml
[package]
name = "wasm-lib"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
```
**src/lib.rs**
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust! You said: {}", input)
}
```

#### 2. Скомпилируйте WASM (из корня плагина)
```bash
wasm-pack build wasm-lib --target web --out-dir pkg --out-name wasm_lib
```

#### 3. Встройте WASM как base64
```bash
echo "export const WASM_BASE64 = \"$(base64 wasm-lib/pkg/wasm_lib_bg.wasm | tr -d '\n')\";" > src/wasm_base64.ts
```

#### 4. Настройте `esbuild.config.mjs`
- Удалите импорт `wasmLoader`
- Уберите `wasmLoader` из массива `plugins` (оставьте `plugins: []`)
- Остальные настройки (формат `cjs`, `target: "es2018"`) не меняйте

Пример минимального конфига:
```javascript
import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", ...builtinModules],
    format: "cjs",
    target: "es2018",
    outfile: "main.js",
    plugins: [],
});

if (prod) await context.rebuild();
else await context.watch();
```

#### 5. Напишите код плагина (`src/main.ts`)
```typescript
import { Plugin, Notice } from "obsidian";
import init, { my_wasm_function } from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "./wasm_base64";

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export default class FsrsPlugin extends Plugin {
    async onload() {
        try {
            const wasmBytes = base64ToBytes(WASM_BASE64);
            await init({ module_or_path: wasmBytes });
            const result = my_wasm_function("тестовые данные");
            new Notice(result);
        } catch (e) {
            console.error(e);
            new Notice("WASM error");
        }
    }
}
```

#### 6. Соберите и установите
```bash
npm run dev
```
Скопируйте папку плагина в `<ваше хранилище>/.obsidian/plugins/`, включите плагин.  
В консоли и через `Notice` увидите результат из Rust.

### Почему этот метод работает в Obsidian
- **`--target web`** генерирует модуль, который не использует `top-level await` и не требует `import.meta` при передаче бинарных данных через `module_or_path`.
- **Base64 + ручной `init`** обходят ограничения Obsidian (CommonJS, старый target), не требуя сетевых запросов.
- **Отсутствие плагинов esbuild** для WASM – меньше зависимостей и конфликтов.

Этот подход универсален и может быть использован для любой консольной утилиты на Rust, которую вы хотите запускать внутри Obsidian.
