import { Notice, App } from "obsidian";
import {
	get_fsrs_yaml,
	create_fsrs_card_json,
} from "../../wasm-lib/pkg/wasm_lib";

/**
 * Добавляет поля FSRS в текущий активный файл
 * @param app - Экземпляр приложения Obsidian
 * @returns Promise<void>
 */
export async function addFsrsFieldsToCurrentFile(app: App): Promise<void> {
	try {
		// Получаем активный файл
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return;
		}

		console.log("Получение YAML полей FSRS из Rust...");
		const fsrsYaml = get_fsrs_yaml();
		console.log("FSRS YAML поля:", fsrsYaml);

		// Читаем содержимое файла
		const fileContent = await app.vault.read(activeFile);
		let newContent = fileContent;

		// Проверяем, есть ли уже frontmatter в файле
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(fileContent);

		if (match) {
			// Есть frontmatter - добавляем поля FSRS после существующего frontmatter
			const existingFrontmatter = match[0];
			const afterFrontmatter = fileContent.slice(match[0].length);
			newContent =
				existingFrontmatter + "\n" + fsrsYaml + "\n" + afterFrontmatter;
		} else {
			// Нет frontmatter - создаем новый с полями FSRS
			newContent = "---\n" + fsrsYaml + "\n---\n\n" + fileContent;
		}

		// Сохраняем изменения
		await app.vault.modify(activeFile, newContent);

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
