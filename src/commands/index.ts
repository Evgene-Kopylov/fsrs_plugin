interface CommandsAccess {
    commands: Map<string, { name: string }>;
}

import type { App } from "obsidian";
import type FsrsPlugin from "../main";
import { i18n } from "../utils/i18n";
import { FsrsHelpModal } from "../ui/fsrs-help-modal";
import { showReviewHistoryForCurrentFile } from "../ui/review-history-modal";
import { insertReviewButton } from "./add-review-button";

/**
 * Обновляет имена команд при смене языка без перезагрузки плагина
 */
export function updateCommandNames(app: App): void {
    const commands = [
        { id: "add-fsrs-fields", key: "commands.add_fsrs_fields" },
        { id: "find-fsrs-cards", key: "commands.find_fsrs_cards" },
        { id: "review-current-card", key: "commands.review_current_card" },
        { id: "delete-last-review", key: "commands.delete_last_review" },
        { id: "show-fsrs-help", key: "commands.show_fsrs_help" },
        { id: "show-review-history", key: "commands.show_review_history" },
        { id: "insert-review-button", key: "commands.insert_review_button" },
    ];

    const commandMap = (app as unknown as CommandsAccess).commands;
    for (const cmd of commands) {
        const key = `fsrs-plugin:${cmd.id}`;
        const command = commandMap?.get(key);
        if (command) {
            command.name = i18n.t(cmd.key);
        }
    }
}

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
            await showReviewHistoryForCurrentFile(plugin);
        },
    });

    // Команда для вставки блока кнопки повторения после frontmatter
    plugin.addCommand({
        id: "insert-review-button",
        name: i18n.t("commands.insert_review_button"),
        callback: async () => {
            await insertReviewButton(plugin.app, plugin);
        },
    });
}
