import { App } from "obsidian";
import type FsrsPlugin from "../main";
import { showNotice } from "../utils/notice";

import { extractFrontmatterWithMatch } from "../utils/fsrs-helper";
import { verboseLog } from "../utils/logger";

/**
 * Вставляет блок `fsrs-review-button` после frontmatter текущего активного файла.
 * @param app - Экземпляр приложения Obsidian
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function insertReviewButton(
    app: App,
    plugin: FsrsPlugin,
): Promise<void> {
    try {
        // Получаем активный файл
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        // Проверяем, что файл - markdown
        if (!activeFile.path.endsWith(".md")) {
            console.debug("Файл не является markdown:", activeFile.path);
            return;
        }

        verboseLog(
            "Команда: Вставить блок кнопки повторения для файла",
            activeFile.name,
        );

        // Читаем содержимое файла
        const fileContent = await app.vault.read(activeFile);

        // Проверяем, есть ли уже блок fsrs-review-button в файле
        if (fileContent.includes("```fsrs-review-button")) {
            showNotice("notices.review_button_exists");
            return;
        }

        // Ищем frontmatter
        const frontmatterMatch = extractFrontmatterWithMatch(fileContent);
        if (!frontmatterMatch) {
            showNotice("notices.no_frontmatter");
            return;
        }

        // Позиция после закрывающего ---
        const afterFrontmatterIndex =
            frontmatterMatch.match.index + frontmatterMatch.match[0].length;
        const afterFrontmatter = fileContent.slice(afterFrontmatterIndex);

        // Определяем, сколько новых строк нужно добавить перед блоком
        // Цель: одна пустая строка между концом frontmatter и блоком кнопки
        // Считаем количество переводов строк в начале afterFrontmatter
        let leadingNewlines = 0;
        for (let i = 0; i < afterFrontmatter.length; i++) {
            if (afterFrontmatter[i] === "\n") {
                leadingNewlines++;
            } else {
                break;
            }
        }

        // Сколько переводов строк мы оставим/добавим (всегда 2 для одной пустой строки)
        const targetNewlines = 2;
        let prefix = "";
        let newlinesToSkip = 0;

        if (leadingNewlines >= targetNewlines) {
            // Уже есть как минимум одна пустая строка, оставляем первые два перевода строки
            prefix = afterFrontmatter.slice(0, targetNewlines);
            newlinesToSkip = targetNewlines;
        } else if (leadingNewlines === 1) {
            // Есть один перевод строки, добавляем ещё один
            prefix = "\n\n";
            newlinesToSkip = 1;
        } else {
            // Нет переводов строк, добавляем два
            prefix = "\n\n";
            newlinesToSkip = 0;
        }

        // Создаём блок кнопки с переводом строки после
        const buttonBlock = "```fsrs-review-button\n```\n";

        // Формируем новое содержимое
        const before = fileContent.slice(0, afterFrontmatterIndex);
        // Пропускаем учтённые переводы строк
        const after = afterFrontmatter.slice(newlinesToSkip);
        const newContent = before + prefix + buttonBlock + after;

        // Сохраняем изменения
        await app.vault.modify(activeFile, newContent);

        // Уведомляем рендереры таблиц об обновлении данных
        plugin.notifyFsrsTableRenderers();

        verboseLog(
            "Блок fsrs-review-button успешно добавлен в файл",
            activeFile.name,
        );
    } catch (error) {
        console.error("Ошибка при вставке блока кнопки повторения:", error);
        showNotice("notices.card_processing_error");
    }
}
