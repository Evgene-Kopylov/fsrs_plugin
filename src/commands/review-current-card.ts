import { Notice, App } from "obsidian";
import {
	review_card,
	get_fsrs_yaml_after_review,
	get_next_review_dates,
	get_current_time,
} from "../../wasm-lib/pkg/wasm_lib";
import { parseFSRSFromFrontmatter } from "../utils/fsrs-helper";
import type { FSRSCard } from "../interfaces/fsrs";

/**
 * Повторяет текущую активную карточку FSRS с оценкой "Good"
 * @param app - Экземпляр приложения Obsidian
 * @returns Promise<void>
 */
export async function reviewCurrentCard(app: App): Promise<void> {
	try {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return;
		}

		const content = await app.vault.read(activeFile);

		// Ищем frontmatter с полями FSRS
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(content);

		if (!match || !match[1]) {
			new Notice("Файл не содержит полей FSRS в frontmatter");
			return;
		}

		const frontmatter = match[1];

		// Парсим поля FSRS из frontmatter
		const card = parseFSRSFromFrontmatter(frontmatter, activeFile.path);
		if (!card) {
			new Notice("Не удалось распарсить поля FSRS");
			return;
		}

		// Создаем JSON карточки
		const cardJson = JSON.stringify(card);
		const now = get_current_time();

		// Оценка по умолчанию - "Good"
		const rating = "Good";

		console.log("Обновление карточки с оценкой:", rating);
		console.log("JSON карточки:", cardJson);
		console.log("Текущее время:", now);

		// Обновляем карточку через WASM
		const updatedCardJson = review_card(cardJson, rating, now);
		console.log("Обновленная карточка:", updatedCardJson);

		// Получаем YAML с обновленными полями
		const updatedYaml = get_fsrs_yaml_after_review(cardJson, rating, now);

		// Заменяем старый frontmatter на новый
		const newContent = content.replace(
			frontmatterRegex,
			"---\n" + updatedYaml + "\n---",
		);

		// Сохраняем изменения
		await app.vault.modify(activeFile, newContent);

		new Notice(`Карточка повторена с оценкой: ${rating}`);
		console.log("Карточка успешно обновлена");

		// Показываем следующие даты повторения
		const nextDatesJson = get_next_review_dates(updatedCardJson, now);
		const nextDates = JSON.parse(nextDatesJson);
		console.log("Следующие даты повторения:", nextDates);
	} catch (error) {
		console.error("Ошибка при повторении карточки:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice("Ошибка при повторении карточки: " + errorMessage);
	}
}
