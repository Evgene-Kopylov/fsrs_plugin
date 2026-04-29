import fs from "fs";
import path from "path";

const wasmFilePath = path.resolve(
    process.cwd(),
    "wasm-lib/pkg/wasm_lib_bg.wasm",
);
const outputFilePath = path.resolve(
    process.cwd(),
    "wasm-lib/pkg/wasm_lib_base64.ts",
);

/**
 * Разбивает длинную строку на чанки фиксированного размера
 * @param {string} str Исходная строка
 * @param {number} chunkSize Размер чанка (по умолчанию 4096)
 * @returns {string[]} Массив чанков
 */
function chunkString(str, chunkSize = 4096) {
    const chunks = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        chunks.push(str.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Генерирует TypeScript код с разбитой на чанки строкой
 * @param {string} base64String Base64 строка
 * @returns {string} TypeScript код
 */
function generateTsContent(base64String) {
    const chunks = chunkString(base64String, 4096);

    if (chunks.length === 1) {
        // Если строка короткая, используем шаблонный литерал
        return `export const WASM_BASE64 = "${base64String}";`;
    }

    // Для длинных строк используем конкатенацию чанков с шаблонными литералами
    let tsContent = "export const WASM_BASE64 = ";

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (i === 0) {
            tsContent += `"${chunk}"`;
        } else {
            tsContent += `\n  + "${chunk}"`;
        }
    }

    tsContent += ";\n";
    return tsContent;
}

try {
    // Проверяем существование входного файла
    if (!fs.existsSync(wasmFilePath)) {
        console.error(`WASM файл не найден: ${wasmFilePath}`);
        console.error("Сначала выполните сборку WASM: npm run build-wasm");
        process.exit(1);
    }

    // Читаем WASM файл как бинарные данные
    const wasmBuffer = fs.readFileSync(wasmFilePath);

    // Кодируем в base64
    const base64String = wasmBuffer.toString("base64");

    // Генерируем содержимое TypeScript файла
    const tsContent = generateTsContent(base64String);

    // Убеждаемся, что директория существует
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Записываем файл
    fs.writeFileSync(outputFilePath, tsContent);

    console.log("WASM encoded ✅");
} catch (error) {
    console.error("Ошибка при кодировании WASM:", error.message);
    process.exit(1);
}
