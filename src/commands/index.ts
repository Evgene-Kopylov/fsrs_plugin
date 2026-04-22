import type FsrsPlugin from "../main";
import { i18n } from "../utils/i18n";
import { FsrsHelpModal } from "../ui/fsrs-help-modal";
import { showReviewHistoryForCurrentFile } from "../ui/review-history-modal";

/**
 * Регистрирует все команды плагина FSRS
 */
export function registerCommands(plugin: FsrsPlugin): void {
    // Команда для добавления полей FSRS в текущий файл
    plugin.addCommand({
        id: "add-fsrs-fields",
        name: i18n.t("commands.add_fsrs_fields"),
        callback: async () => {
            await plugin.addFsrsFieldsToCurrentFile();
        },
    });

    // Команда для поиска карточек, готовых к повторению
    plugin.addCommand({
        id: "find-fsrs-cards",
        name: i18n.t("commands.find_fsrs_cards"),
        callback: async () => {
            await plugin.findCardsForReview();
        },
    });

    // Команда для повторения текущей карточки
    plugin.addCommand({
        id: "review-current-card",
        name: i18n.t("commands.review_current_card"),
        callback: async () => {
            await plugin.reviewCurrentCard();
        },
    });

    // Команда для удаления последнего повторения текущей карточки
    plugin.addCommand({
        id: "delete-last-review",
        name: i18n.t("commands.delete_last_review"),
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
        name: i18n.t("commands.show_fsrs_help"),
        callback: () => {
            const modal = new FsrsHelpModal(plugin.app);
            modal.show();
        },
    });

    // Команда для просмотра истории повторений текущей карточки
    plugin.addCommand({
        id: "show-review-history",
        name: i18n.t("commands.show_review_history"),
        callback: async () => {
            await showReviewHistoryForCurrentFile(plugin.app);
        },
    });
}
