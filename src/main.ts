import { Plugin, Notice } from "obsidian";
import init, { my_wasm_function } from "../wasm-lib/pkg/wasm_lib";
import { WASM_BASE64 } from "./wasm_base64";
import { MyPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { SampleSettingTab } from "./settings";

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export default class MyWasmPlugin extends Plugin {
	settings: MyPluginSettings;
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));

		console.log("=== Загрузка плагина с WASM ===");

		try {
			console.log("1. Конвертируем base64 в байты...");
			const wasmBytes = base64ToBytes(WASM_BASE64);
			console.log("2. Длина WASM байтов:", wasmBytes.length);

			console.log("3. Вызываем init...");
			await init({ module_or_path: wasmBytes });
			console.log("4. WASM инициализирован");

			console.log("5. Вызываем my_wasm_function...");
			const result = my_wasm_function("тестовые данные из Obsidian");
			console.log("6. Результат из Rust:", result);

			console.log("7. Показываем Notice...");
			new Notice(result);
			console.log("8. Notice показано");
		} catch (e) {
			console.error("Ошибка загрузки WASM модуля:", e);
			new Notice("Ошибка загрузки WASM компонента");
		}
	}

	onunload() {
		console.log("Выгрузка плагина");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
