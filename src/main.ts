import { Plugin, Notice } from "obsidian";
import init, {
	my_wasm_function,
	get_fsrs_yaml,
	create_fsrs_card_json,
} from "../wasm-lib/pkg/wasm_lib";
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

		// Добавляем команду для вставки полей FSRS в шапку файла
		this.addCommand({
			id: "add-fsrs-fields",
			name: "Добавить поля FSRS в шапку файла",
			callback: async () => {
				await this.addFsrsFieldsToCurrentFile();
			},
		});
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

	// Метод для добавления полей FSRS в текущий файл
	async addFsrsFieldsToCurrentFile() {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice("Нет активного файла");
				return;
			}

			console.log("Получение YAML полей FSRS из Rust...");
			const fsrsYaml = get_fsrs_yaml();
			console.log("FSRS YAML поля:", fsrsYaml);

			const fileContent = await this.app.vault.read(activeFile);
			let newContent = fileContent;

			// Проверяем, есть ли уже frontmatter в файле
			const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
			const match = frontmatterRegex.exec(fileContent);

			if (match) {
				// Есть frontmatter - добавляем поля FSRS после существующего frontmatter
				const existingFrontmatter = match[0];
				const afterFrontmatter = fileContent.slice(match[0].length);
				newContent =
					existingFrontmatter +
					"\n" +
					fsrsYaml +
					"\n" +
					afterFrontmatter;
			} else {
				// Нет frontmatter - создаем новый с полями FSRS
				newContent = "---\n" + fsrsYaml + "\n---\n\n" + fileContent;
			}

			// Сохраняем изменения
			await this.app.vault.modify(activeFile, newContent);

			new Notice("Поля FSRS добавлены в файл");
			console.log("Поля FSRS успешно добавлены в файл:", activeFile.name);

			// Также показываем JSON версию в консоли для отладки
			console.log("JSON версия карточки FSRS:", create_fsrs_card_json());
		} catch (error) {
			console.error("Ошибка при добавлении полей FSRS:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice("Ошибка при добавлении полей FSRS: " + errorMessage);
		}
	}
}
