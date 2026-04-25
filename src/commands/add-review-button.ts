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

        // Читаем для проверок ДО process (уведомления не работают внутри callback)
        const fileContent = await app.vault.read(activeFile);

        if (fileContent.includes("```fsrs-review-button")) {
            showNotice("notices.review_button_exists");
            return;
        }

        const frontmatterMatch = extractFrontmatterWithMatch(fileContent);
        if (!frontmatterMatch) {
            showNotice("notices.no_frontmatter");
            return;
        }

        // Атомарная запись через process
        await app.vault.process(activeFile, (data) => {
            const match = extractFrontmatterWithMatch(data);
            if (!match) return data;

            const afterFrontmatterIndex =
                match.match.index + match.match[0].length;
            const afterFrontmatter = data.slice(afterFrontmatterIndex);

            // Определяем, сколько новых строк нужно добавить перед блоком
            // Цель: одна пустая строка между концом frontmatter и блоком кнопки
            let leadingNewlines = 0;
            for (let i = 0; i < afterFrontmatter.length; i++) {
                if (afterFrontmatter[i] === "\n") {
                    leadingNewlines++;
                } else {
                    break;
                }
            }

            const targetNewlines = 2;
            let prefix = "";
            let newlinesToSkip = 0;

            if (leadingNewlines >= targetNewlines) {
                prefix = afterFrontmatter.slice(0, targetNewlines);
                newlinesToSkip = targetNewlines;
            } else if (leadingNewlines === 1) {
                prefix = "\n\n";
                newlinesToSkip = 1;
            } else {
                prefix = "\n\n";
                newlinesToSkip = 0;
            }

            const buttonBlock = "```fsrs-review-button\n```\n";

            const before = data.slice(0, afterFrontmatterIndex);
            const after = afterFrontmatter.slice(newlinesToSkip);
            return before + prefix + buttonBlock + after;
        });

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
