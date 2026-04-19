
import { Notice, App } from "obsidian";
import {
	parseModernFsrsFromFrontmatter,
	extractFrontmatterWithMatch,
	updateReviewsInYaml,
} from "../../utils/fsrs-helper";
import type MyPlugin from "../../main";

/**
 * Удаляет последнее повторение карточки FSRS по указанному пути файла
 * @param app - Экземпляр приложения Obsidian
 * @param plugin - Экземпляр плагина FSRS
 * @param filePath - Путь к файлу карточки
 * @returns Promise<boolean> - true, если удаление успешно, false в противном случае
 */
export async function deleteLastReview(
	app: App,
	plugin: MyPlugin,
	filePath: string,
): Promise<boolean> {
	try {
		const file = app.vault.getFileByPath(filePath);
		if (!file) {
			new Notice("Файл не найден");
			return false;
		}

		const content = await app.vault.read(file);
		const frontmatterMatch = extractFrontmatterWithMatch(content);

		if (!frontmatterMatch) {
			new Notice("Файл не содержит frontmatter");
			return false;
		}

		const frontmatter = frontmatterMatch.content;
		const parseResult = parseModernFsrsFromFrontmatter(
			frontmatter,
			filePath,
		);

		if (!parseResult.success || !parseResult.card) {
			new Notice("Not an fsrs card. Nothing to delete.");
			return false;
		}

		const card = parseResult.card;

		// Проверяем, есть ли что удалять
		if (card.reviews.length === 0) {
			new Notice("Нет повторений для удаления");
			return false;
		}

		// Удаляем последнее повторение
		const updatedReviews = [...card.reviews];
		updatedReviews.pop();

		// Обновляем frontmatter
		const updatedFrontmatter = updateReviewsInYaml(
			frontmatter,
			updatedReviews,
		);

		// Собираем обновленное содержимое файла
		const beforeFrontmatter = content.substring(
			0,
			frontmatterMatch.match.index,
		);
		const afterFrontmatter = content.substring(
			frontmatterMatch.match.index + frontmatterMatch.match[0].length,
		);
		const newContent =
			beforeFrontmatter +
			"---\n" +
			updatedFrontmatter +
			"\n---" +
			afterFrontmatter;

		// Сохраняем изменения
		await app.vault.modify(file, newContent);

		new Notice("Последнее повторение удалено");

		// Уведомляем рендереры таблиц об обновлении данных
		plugin.notifyFsrsTableRenderers();
		return true;
	} catch (error) {
		console.error("Ошибка при удалении повторения:", error);
		new Notice("Ошибка при удалении повторения");
		return false;
	}
}

/**
 * Удаляет последнее повторение текущей карточки FSRS
 * @param app - Экземпляр приложения Obsidian
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<boolean> - true, если удаление успешно, false в противном случае
 */
export async function deleteLastReviewCurrentCard(
	app: App,
	plugin: MyPlugin,
): Promise<boolean> {
	try {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return false;
		}

		return await deleteLastReview(app, plugin, activeFile.path);
	} catch (error) {
		console.error("Ошибка при удалении повторения текущей карточки:", error);
		new Notice("Ошибка при удалении повторения");
		return false;
	}
}
