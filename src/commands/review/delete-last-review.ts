import { App } from "obsidian";
import { showNotice } from "../../utils/notice";
import {
    parseModernFsrsFromFrontmatter,
    extractFrontmatterWithMatch,
    cardToFsrsYaml,
} from "../../utils/fsrs-helper";
import { replaceReviewsInFrontmatter } from "./review-card";
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
            showNotice("notices.file_not_found", { path: filePath });
            return false;
        }

        const content = await app.vault.read(file);
        const frontmatterMatch = extractFrontmatterWithMatch(content);

        if (!frontmatterMatch) {
            showNotice("notices.no_frontmatter");
            return false;
        }

        const frontmatter = frontmatterMatch.content;
        const parseResult = parseModernFsrsFromFrontmatter(
            frontmatter,
            filePath,
        );

        if (!parseResult.success || !parseResult.card) {
            showNotice("notices.not_fsrs_card");
            return false;
        }

        const card = parseResult.card;

        // Проверяем, есть ли что удалять
        if (card.reviews.length === 0) {
            showNotice("notices.no_reviews_to_delete");
            return false;
        }

        // Удаляем последнее повторение
        const updatedReviews = [...card.reviews];
        updatedReviews.pop();

        // Создаем обновленную карточку
        const updatedCard = { ...card, reviews: updatedReviews };

        // Получаем YAML для обновленной карточки
        const reviewsYaml = cardToFsrsYaml(updatedCard);

        // Заменяем поле reviews в frontmatter
        const updatedFrontmatter = replaceReviewsInFrontmatter(
            frontmatter,
            reviewsYaml,
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

        showNotice("notices.review_deleted");

        // Уведомляем рендереры таблиц об обновлении данных
        plugin.notifyFsrsTableRenderers();
        return true;
    } catch (error) {
        console.error("Ошибка при удалении повторения:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
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
            showNotice("notices.no_active_file");
            return false;
        }

        return await deleteLastReview(app, plugin, activeFile.path);
    } catch (error) {
        console.error(
            "Ошибка при удалении повторения текущей карточки:",
            error,
        );
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
        return false;
    }
}
