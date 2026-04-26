import { App } from "obsidian";
import { showNotice } from "../utils/notice";
import {
    getNewCardYaml,
    extractFrontmatterWithMatch,
} from "../utils/fsrs-helper";
import type { FsrsPluginSettings } from "../settings";

/**
 * Добавляет поля FSRS в новом формате (с reviews) в текущий активный файл
 * @param app - Экземпляр приложения Obsidian
 * @returns Promise<void>
 */
export async function addFsrsFieldsToCurrentFile(
    app: App,
    settings?: FsrsPluginSettings,
): Promise<void> {
    try {
        // Получаем активный файл
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        console.debug("Получение YAML полей FSRS в новом формате...");
        const fsrsYaml = getNewCardYaml();
        console.debug("FSRS YAML поля (новый формат):", fsrsYaml);

        // Проверяем условия ДО process, чтобы показать уведомления
        const fileContent = await app.vault.read(activeFile);
        const frontmatterMatch = extractFrontmatterWithMatch(fileContent);

        if (frontmatterMatch) {
            const existingContent = frontmatterMatch.content;
            if (!existingContent) {
                showNotice("notices.frontmatter_empty");
                return;
            }
            if (/^reviews\s*:/m.test(existingContent)) {
                showNotice("notices.fsrs_fields_exists");
                return;
            }
        }

        // Атомарная запись через process
        await app.vault.process(activeFile, (data) => {
            const match = extractFrontmatterWithMatch(data);

            let newContent: string;

            if (match) {
                const existingContent = match.content;
                let updatedFrontmatterContent: string;
                if (existingContent.trim() !== "") {
                    updatedFrontmatterContent =
                        existingContent +
                        (existingContent.endsWith("\n") ? "" : "\n") +
                        fsrsYaml;
                } else {
                    updatedFrontmatterContent = fsrsYaml;
                }
                const updatedFrontmatter =
                    "---\n" + updatedFrontmatterContent + "\n---";

                const afterFrontmatter = data.slice(
                    match.match.index + match.match[0].length,
                );
                let buttonBlock = "";
                if (settings?.auto_add_review_button) {
                    if (!data.includes("```fsrs-review-button")) {
                        buttonBlock = "\n```fsrs-review-button\n```\n";
                    }
                }
                newContent =
                    updatedFrontmatter + buttonBlock + afterFrontmatter;
            } else {
                let buttonBlock = "";
                if (settings?.auto_add_review_button) {
                    if (!data.includes("```fsrs-review-button")) {
                        buttonBlock = "\n```fsrs-review-button\n```\n";
                    }
                }
                newContent =
                    "---\n" + fsrsYaml + "\n---\n" + buttonBlock + data;
            }

            return newContent;
        });

        showNotice("notices.fsrs_fields_added");
        console.debug("Поля FSRS успешно добавлены в файл:", activeFile.name);

        console.debug("Новый формат карточки FSRS:");
        console.debug("- Хранит историю повторений в массиве reviews");
        console.debug("- Параметры алгоритма вынесены в настройки плагина");
        console.debug(
            "- Текущее состояние вычисляется на основе последней сессии",
        );
    } catch (error) {
        console.error("Ошибка при добавлении полей FSRS:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
    }
}
