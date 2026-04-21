import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// Полифилл atob для среды тестирования Node.js (браузерное API, отсутствующее в Node)
if (typeof atob === "undefined") {
    global.atob = (b64: string) =>
        Buffer.from(b64, "base64").toString("binary");
}
