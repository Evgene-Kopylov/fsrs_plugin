import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Полифилл atob для среды тестирования Node.js (браузерное API, отсутствующее в Node)
if (typeof atob === "undefined") {
    global.atob = (b64: string) =>
        Buffer.from(b64, "base64").toString("binary");
}

// Инициализация WASM модуля до запуска тестов
import { initSync } from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "../wasm-lib/pkg/wasm_lib_base64";
import { base64ToBytes } from "../src/utils/base64";

initSync({ module: base64ToBytes(WASM_BASE64) });
