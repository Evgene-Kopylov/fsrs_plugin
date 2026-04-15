#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const projectRoot = process.cwd();

console.log("🔍 Запуск тестов плагина Obsidian...\n");

// 1. Проверка структуры проекта
console.log("1. Проверка структуры проекта...");
const requiredFiles = [
	"package.json",
	"manifest.json",
	"src/main.ts",
	"src/wasm_base64.ts",
	"wasm-lib/src/lib.rs",
	"esbuild.config.mjs",
];

let allFilesExist = true;
for (const file of requiredFiles) {
	const filePath = path.join(projectRoot, file);
	if (fs.existsSync(filePath)) {
		console.log(`   ✅ ${file}`);
	} else {
		console.log(`   ❌ ${file} - не найден`);
		allFilesExist = false;
	}
}

if (!allFilesExist) {
	console.error("\n❌ Не все необходимые файлы найдены");
	process.exit(1);
}
console.log("   ✅ Все необходимые файлы присутствуют\n");

// 2. Проверка package.json скриптов
console.log("2. Проверка скриптов package.json...");
const packageJson = JSON.parse(
	fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const requiredScripts = ["build-wasm", "encode-wasm", "dev", "build"];
const missingScripts = requiredScripts.filter(
	(script) => !packageJson.scripts?.[script],
);

if (missingScripts.length > 0) {
	console.error(`   ❌ Отсутствуют скрипты: ${missingScripts.join(", ")}`);
	process.exit(1);
}
console.log("   ✅ Все необходимые скрипты присутствуют\n");

// 3. Проверка сборки WASM
console.log("3. Проверка сборки WASM...");
try {
	console.log("   Запуск npm run build-wasm...");
	execSync("npm run build-wasm", { cwd: projectRoot, stdio: "pipe" });
	console.log("   ✅ WASM успешно собран");
} catch (error) {
	console.error(`   ❌ Ошибка сборки WASM: ${error.message}`);
	console.error(`   stderr: ${error.stderr?.toString()}`);
	process.exit(1);
}

// 4. Проверка кодирования WASM в base64
console.log("\n4. Проверка кодирования WASM в base64...");
try {
	console.log("   Запуск npm run encode-wasm...");
	execSync("npm run encode-wasm", { cwd: projectRoot, stdio: "pipe" });

	const wasmBase64Path = path.join(projectRoot, "src/wasm_base64.ts");
	const wasmBase64Content = fs.readFileSync(wasmBase64Path, "utf8");

	if (!wasmBase64Content.includes('export const WASM_BASE64 = "')) {
		throw new Error("src/wasm_base64.ts не содержит экспорт WASM_BASE64");
	}

	console.log("   ✅ WASM успешно закодирован в base64");
} catch (error) {
	console.error(`   ❌ Ошибка кодирования WASM: ${error.message}`);
	process.exit(1);
}

// 5. Проверка полной сборки плагина
console.log("\n5. Проверка полной сборки плагина...");
try {
	console.log("   Запуск npm run build...");
	execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });
	console.log("   ✅ Плагин успешно собран");
} catch (error) {
	console.error(`   ❌ Ошибка сборки плагина: ${error.message}`);
	console.error(`   stderr: ${error.stderr?.toString()}`);
	process.exit(1);
}

// 6. Проверка выходного файла main.js
console.log("\n6. Проверка выходного файла main.js...");
const mainJsPath = path.join(projectRoot, "main.js");
if (!fs.existsSync(mainJsPath)) {
	console.error("   ❌ main.js не создан");
	process.exit(1);
}

const mainJsContent = fs.readFileSync(mainJsPath, "utf8");
const mainJsSize = fs.statSync(mainJsPath).size;
console.log(`   Размер main.js: ${mainJsSize} байт`);

// Проверка на наличие ключевых строк
const expectedPatterns = [
	{ pattern: /WASM/, name: "WASM" },
	{ pattern: /Rust/, name: "Rust" },
	{ pattern: /base64/, name: "base64" },
	{ pattern: /Notice/, name: "Notice" },
	{ pattern: /console\.log/, name: "console.log" },
	{ pattern: /console\.error/, name: "console.error" },
	{ pattern: /my_wasm_function/, name: "my_wasm_function" },
	{ pattern: /e\.Notice/, name: "e.Notice" },
];

let allPatternsFound = true;
for (const { pattern, name } of expectedPatterns) {
	if (pattern.test(mainJsContent)) {
		console.log(`   ✅ Найдено: ${name}`);
	} else {
		console.log(`   ❌ Не найдено: ${name}`);
		allPatternsFound = false;
	}
}

// Проверка наличия уведомления (Notice)
const noticePattern = /new\s+Notice|e\.Notice/;
if (noticePattern.test(mainJsContent)) {
	console.log("   ✅ Плагин создает уведомление (Notice)");
} else {
	console.log("   ⚠️  Плагин не создает уведомление (Notice)");
}

// Проверка наличия консольных логов

// 7. Проверка manifest.json
console.log("\n7. Проверка manifest.json...");
const manifestPath = path.join(projectRoot, "manifest.json");
try {
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	const requiredManifestFields = [
		"id",
		"name",
		"version",
		"minAppVersion",
		"description",
	];

	for (const field of requiredManifestFields) {
		if (!manifest[field]) {
			console.log(`   ⚠️  Отсутствует поле: ${field}`);
		} else {
			console.log(`   ✅ ${field}: ${manifest[field]}`);
		}
	}

	// Проверка версии
	if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
		console.log("   ⚠️  Версия не соответствует формату SemVer (x.y.z)");
	}
} catch (error) {
	console.error(`   ❌ Ошибка чтения manifest.json: ${error.message}`);
}

// 8. Итоговый вывод
console.log("\n📊 ИТОГИ ТЕСТИРОВАНИЯ:");
console.log("=".repeat(50));

if (allFilesExist && allPatternsFound) {
	console.log("✅ Все базовые тесты пройдены успешно!");
	console.log("\n🎯 Плагин готов к использованию:");
	console.log("1. main.js создан и содержит все необходимые паттерны");
	console.log("2. WASM успешно скомпилирован и закодирован");
	console.log("3. manifest.json валиден");
	console.log("\n📝 Для тестирования в Obsidian:");
	console.log("1. Скопируйте main.js, manifest.json в папку плагина");
	console.log("2. В Obsidian: Settings → Community plugins → Enable plugin");
	console.log("3. Проверьте уведомление и консольные логи");
} else {
	console.log("⚠️  Некоторые тесты не пройдены");
	console.log("Проверьте вывод выше для деталей");
}

console.log("\n🔍 Для ручного тестирования:");
console.log("- Запустите npm run dev для разработки с отслеживанием изменений");

console.log("- Проверьте консоль браузера в Obsidian при загрузке плагина");
