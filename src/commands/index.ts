import type FsrsPlugin from "../main";
import { FsrsHelpModal } from "../ui/fsrs-help-modal";
import { showReviewHistoryForCurrentFile } from "../ui/review-history-modal";

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

	// Команда для удаления последнего повторения текущей карточки
	plugin.addCommand({
		id: "delete-last-review",
		name: "Удалить последнее повторение карточки",
		callback: async () => {
			const success = await plugin.deleteLastReviewForCurrentFile();
			if (success) {
				// Уведомление показывается внутри метода
				// Дополнительных действий не требуется
			}
		},
	});

	// Команда для открытия справки по синтаксису fsrs-table
	plugin.addCommand({
		id: "show-fsrs-help",
		name: "Показать справку по синтаксису fsrs-table",
		callback: () => {
			const modal = new FsrsHelpModal(plugin.app);
			modal.show();
		},
	});

	// Команда для просмотра истории повторений текущей карточки
	plugin.addCommand({
		id: "show-review-history",
		name: "Показать историю повторений",
		callback: async () => {
			await showReviewHistoryForCurrentFile(plugin.app);
		},
	});
}
