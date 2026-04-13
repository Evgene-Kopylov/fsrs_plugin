import { Notice, App } from "obsidian";
import { getNewCardYaml } from "../utils/fsrs-helper";

/**
 * Добавляет поля FSRS в новый формате (с reviews) в текущий активный файл
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

		console.log("Получение YAML полей FSRS в новом формате...");
		const fsrsYaml = await getNewCardYaml();
		console.log("FSRS YAML поля (новый формат):", fsrsYaml);

		// Читаем содержимое файла
		const fileContent = await app.vault.read(activeFile);
		let newContent = fileContent;

		// Проверяем, есть ли уже frontmatter в файле
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(fileContent);

		if (match) {
			// Есть frontmatter - проверяем, есть ли уже поля FSRS
			const existingFrontmatter = match[0];
			const existingContent = match[1];

			// Проверяем, есть ли уже srs: true
			if (existingContent && /^srs\s*:/m.test(existingContent)) {
				// Уже есть поля FSRS - обновляем их
				new Notice(
					"В файле уже есть поля FSRS. Используйте команду повторения для обновления.",
				);
				return;
			}

			// Добавляем поля FSRS после существующего frontmatter
			const afterFrontmatter = fileContent.slice(match[0].length);
			newContent =
				existingFrontmatter + "\n" + fsrsYaml + "\n" + afterFrontmatter;
		} else {
			// Нет frontmatter - создаем новый с полями FSRS
			newContent = "---\n" + fsrsYaml + "\n---\n\n" + fileContent;
		}

		// Сохраняем изменения
		await app.vault.modify(activeFile, newContent);

		new Notice("Поля FSRS (новый формат) добавлены в файл");
		console.log("Поля FSRS успешно добавлены в файл:", activeFile.name);

		// Показываем информацию о формате
		console.log("Новый формат карточки FSRS:");
		console.log("- Хранит историю повторений в массиве reviews");
		console.log("- Параметры алгоритма вынесены в настройки плагина");
		console.log(
			"- Текущее состояние вычисляется на основе последней сессии",
		);
	} catch (error) {
		console.error("Ошибка при добавлении полей FSRS:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice("Ошибка при добавлении полей FSRS: " + errorMessage);
	}
}
