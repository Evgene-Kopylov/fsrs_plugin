interface CommandsAccess {
    commands: Map<string, { name: string }>;
}

import type { App } from "obsidian";
import type FsrsPlugin from "../main";
import { i18n } from "../utils/i18n";
import { FsrsHelpModal } from "../ui/fsrs-help-modal";
import { showReviewHistoryForCurrentFile } from "../ui/review-history-modal";
import { insertReviewButton } from "./add-review-button";
import { insertDefaultTable } from "./add-default-table";

/** Карта эмодзи для каждой команды (не зависят от локали) */
const COMMAND_EMOJIS: Record<string, string> = {
    add_fsrs_fields: "＋",
    review_current_card: "✓",
    delete_last_review: "X",
    show_fsrs_help: "?",
    show_review_history: "H",
    insert_review_button: "□",
    insert_default_table: "⬒",
};

/**
 * Собирает полное имя команды из эмодзи и локализованного текста.
 * @param key — путь в JSON локализации, например "commands.add_fsrs_fields"
 */
function commandEmojiText(key: string): string {
    const cmdKey = key.split(".").pop()!;
    const emoji = COMMAND_EMOJIS[cmdKey] ?? "";
    const name = i18n.t(key);
    return `${emoji} ${name}`;
}

/**
 * Обновляет имена команд при смене языка без перезагрузки плагина
 */
export function updateCommandNames(app: App): void {
    const commands = [
        { id: "add-fields", key: "commands.add_fsrs_fields" },
        { id: "review-current-card", key: "commands.review_current_card" },
        { id: "delete-last-review", key: "commands.delete_last_review" },
        { id: "show-help", key: "commands.show_fsrs_help" },
        { id: "show-review-history", key: "commands.show_review_history" },
        { id: "insert-review-button", key: "commands.insert_review_button" },
        { id: "insert-default-table", key: "commands.insert_default_table" },
    ];

    const commandMap = (app as unknown as CommandsAccess).commands;
    for (const cmd of commands) {
        const key = `fsrs:${cmd.id}`;
        const command = commandMap?.get(key);
        if (command) {
            command.name = commandEmojiText(cmd.key);
        }
    }
}

/**
 * Регистрирует все команды плагина FSRS
 */
export function registerCommands(plugin: FsrsPlugin): void {
    // Команда для добавления полей FSRS в текущий файл
    plugin.addCommand({
        id: "add-fields",
        name: commandEmojiText("commands.add_fsrs_fields"),
        callback: async () => {
            await plugin.addFsrsFieldsToCurrentFile();
        },
    });

    // Команда для повторения текущей карточки
    plugin.addCommand({
        id: "review-current-card",
        name: commandEmojiText("commands.review_current_card"),
        callback: async () => {
            await plugin.reviewCurrentCard();
        },
    });

    // Команда для удаления последнего повторения текущей карточки
    plugin.addCommand({
        id: "delete-last-review",
        name: commandEmojiText("commands.delete_last_review"),
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
        id: "show-help",
        name: commandEmojiText("commands.show_fsrs_help"),
        callback: () => {
            const modal = new FsrsHelpModal(plugin.app);
            modal.show();
        },
    });

    // Команда для просмотра истории повторений текущей карточки
    plugin.addCommand({
        id: "show-review-history",
        name: commandEmojiText("commands.show_review_history"),
        callback: async () => {
            await showReviewHistoryForCurrentFile(plugin);
        },
    });

    // Команда для вставки блока кнопки повторения после frontmatter
    plugin.addCommand({
        id: "insert-review-button",
        name: commandEmojiText("commands.insert_review_button"),
        callback: async () => {
            await insertReviewButton(plugin.app, plugin);
        },
    });

    // Команда для вставки дефолтного fsrs-table
    plugin.addCommand({
        id: "insert-default-table",
        name: commandEmojiText("commands.insert_default_table"),
        editorCallback: async (editor) => {
            await insertDefaultTable(plugin.app, plugin, editor);
        },
    });
}
