import { App } from "obsidian";
import type FsrsPlugin from "../main";
import { showNotice } from "../utils/notice";
import { verboseLog } from "../utils/logger";
import { extractFrontmatterWithMatch } from "../utils/fsrs/fsrs-frontmatter";

/**
 * Дефолтный блок fsrs-table
 */
export const DEFAULT_TABLE_BLOCK =
    '```fsrs-table\nSELECT file as " ", difficulty as "D",\n       stability as "S", retrievability as "R",\n       overdue as "Overdue"\nLIMIT 20\n```\n';

/**
 * Чистая функция: добавляет дефолтный блок fsrs-table в начало содержимого.
 * Пустая строка перед блоком, пустая строка после блока.
 */
export function addDefaultTableToContent(data: string): string {
    const frontmatterMatch = extractFrontmatterWithMatch(data);
    if (frontmatterMatch) {
        const afterFmIndex =
            frontmatterMatch.match.index + frontmatterMatch.match[0].length;
        const before = data.slice(0, afterFmIndex) + "\n";
        const after = data.slice(afterFmIndex);
        return before + "\n" + DEFAULT_TABLE_BLOCK + "\n" + after;
    }
    return "\n" + DEFAULT_TABLE_BLOCK + "\n" + data;
}

/**
 * Вставляет дефолтный блок `fsrs-table` в начало активного файла.
 * Пустая строка перед блоком, пустая строка после блока.
 */
export async function insertDefaultTable(
    app: App,
    plugin: FsrsPlugin,
): Promise<void> {
    try {
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        if (!activeFile.path.endsWith(".md")) {
            console.debug("Файл не является markdown:", activeFile.path);
            return;
        }

        verboseLog(
            "Команда: Вставить дефолтный fsrs-table для файла",
            activeFile.name,
        );

        await app.vault.process(activeFile, (data) => {
            return addDefaultTableToContent(data);
        });

        plugin.notifyFsrsTableRenderers();

        verboseLog(
            "Дефолтный fsrs-table успешно добавлен в файл",
            activeFile.name,
        );
    } catch (error) {
        console.error("Ошибка при вставке дефолтного fsrs-table:", error);
        showNotice("notices.card_processing_error");
    }
}
