import type FsrsPlugin from "../main";

/**
 * Регистрирует все команды плагина FSRS
 */
export function registerCommands(plugin: FsrsPlugin): void {
	// Команда для добавления полей FSRS в текущий файл
	plugin.addCommand({
		id: "add-fsrs-fields",
		name: "Добавить поля FSRS в шапку файла",
		callback: async () => {
			await plugin.addFsrsFieldsToCurrentFile();
		},
	});

	// Команда для поиска карточек, готовых к повторению
	plugin.addCommand({
		id: "find-fsrs-cards",
		name: "Найти карточки для повторения",
		callback: async () => {
			await plugin.findCardsForReview();
		},
	});

	// Команда для повторения текущей карточки
	plugin.addCommand({
		id: "review-current-card",
		name: "Повторить текущую карточку",
		callback: async () => {
			await plugin.reviewCurrentCard();
		},
	});
}
