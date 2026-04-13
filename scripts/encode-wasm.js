import fs from "fs";
import path from "path";

const wasmFilePath = path.resolve(
	process.cwd(),
	"wasm-lib/pkg/wasm_lib_bg.wasm",
);
const outputFilePath = path.resolve(process.cwd(), "generated/wasm_base64.ts");

try {
	// Проверяем существование входного файла
	if (!fs.existsSync(wasmFilePath)) {
		console.error(`WASM файл не найден: ${wasmFilePath}`);
		console.error("Сначала выполните сборку WASM: npm run build-wasm");
		process.exit(1);
	}

	// Читаем WASM файл как бинарные данные
	console.log(`Чтение WASM файла: ${wasmFilePath}`);
	const wasmBuffer = fs.readFileSync(wasmFilePath);

	// Кодируем в base64
	const base64String = wasmBuffer.toString("base64");

	// Создаем содержимое TypeScript файла
	const tsContent = `export const WASM_BASE64 = "${base64String}";`;

	// Убеждаемся, что директория существует
	const outputDir = path.dirname(outputFilePath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Записываем файл
	fs.writeFileSync(outputFilePath, tsContent);

	console.log(`Файл создан: ${outputFilePath}`);
	console.log(`Размер WASM: ${wasmBuffer.length} байт`);
	console.log(`Размер base64: ${base64String.length} символов`);
} catch (error) {
	console.error("Ошибка при кодировании WASM:", error.message);
	process.exit(1);
}
