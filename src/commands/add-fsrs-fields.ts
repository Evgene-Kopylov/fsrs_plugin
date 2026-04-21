import { App } from "obsidian";
import { showNotice } from "../utils/i18n";
import {
    createNewReviewsYaml,
    extractFrontmatterWithMatch,
} from "../utils/fsrs-helper";
import type { FsrsPluginSettings } from "../settings";

/**
 * Добавляет поля FSRS в новый формате (с reviews) в текущий активный файл
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
        const fsrsYaml = createNewReviewsYaml([]);
        console.debug("FSRS YAML поля (новый формат):", fsrsYaml);

        // Читаем содержимое файла
        const fileContent = await app.vault.read(activeFile);
        let newContent = fileContent;

        // Проверяем, есть ли уже frontmatter в файле
        const frontmatterMatch = extractFrontmatterWithMatch(fileContent);

        if (frontmatterMatch) {
            // Есть frontmatter - проверяем, есть ли уже поля FSRS
            const existingContent = frontmatterMatch.content;
            if (!existingContent) {
                showNotice("notices.frontmatter_empty");
                return;
            }

            // Проверяем, есть ли уже reviews поле (FSRS карточка)
            if (/^reviews\s*:/m.test(existingContent)) {
                // Уже есть поля FSRS - обновляем их
                showNotice("notices.fsrs_fields_exists");
                return;
            }

            // Добавляем поля FSRS внутрь существующего frontmatter
            let updatedFrontmatterContent;
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

            // Блок кнопки добавляется после frontmatter
            const afterFrontmatter = fileContent.slice(
                frontmatterMatch.match.index! + // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
                    frontmatterMatch.match[0].length,
            );
            let buttonBlock = "";
            if (settings?.auto_add_review_button) {
                // Проверяем, есть ли уже блок fsrs-review-button в файле
                if (!fileContent.includes("```fsrs-review-button")) {
                    buttonBlock = "\n```fsrs-review-button\n```\n";
                }
            }
            newContent = updatedFrontmatter + buttonBlock + afterFrontmatter;
        } else {
            // Нет frontmatter - создаем новый с полями FSRS
            let buttonBlock = "";
            if (settings?.auto_add_review_button) {
                // Проверяем, есть ли уже блок fsrs-review-button в файле
                if (!fileContent.includes("```fsrs-review-button")) {
                    buttonBlock = "\n```fsrs-review-button\n```\n";
                }
            }
            newContent =
                "---\n" + fsrsYaml + "\n---\n" + buttonBlock + fileContent;
        }

        // Сохраняем изменения
        await app.vault.modify(activeFile, newContent);
        showNotice("notices.fsrs_fields_added");
        console.debug("Поля FSRS успешно добавлены в файл:", activeFile.name);

        // Показываем информацию о формате
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
