import { App, Editor } from "obsidian";
import type FsrsPlugin from "../main";
import { showNotice } from "../utils/notice";
import { verboseLog } from "../utils/logger";

/**
 * Дефолтный блок fsrs-table
 */
export const DEFAULT_TABLE_BLOCK =
    '```fsrs-table\nSELECT file as " ", difficulty as "D",\n       stability as "S", retrievability as "R",\n       date_format(due, \'%Y-%m-%d\') as "Следующее"\nLIMIT 20\n```\n';

/**
 * Ищет пустую строку ниже курсора (строка из пробелов/табов тоже пустая).
 * Если не найдено — возвращает lines.length (вставка в конец файла).
 */
export function findInsertLine(lines: string[], cursorLine: number): number {
    for (let i = cursorLine; i < lines.length; i++) {
        if (lines[i]?.trim() === "") return i;
    }
    return lines.length;
}

/**
 * Вставляет произвольный блок в позицию курсора.
 * Общая логика для insertDefaultTable и insertHeatmap.
 */
export async function insertBlock(
    app: App,
    plugin: FsrsPlugin,
    block: string,
    editor?: Editor,
): Promise<boolean> {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        showNotice("notices.no_active_file");
        return false;
    }
    if (!activeFile.path.endsWith(".md")) return false;

    if (editor) {
        const cursor = editor.getCursor();
        const content = await app.vault.read(activeFile);
        const lines = content.split("\n");
        const insertLine = findInsertLine(lines, cursor.line);

        let newContent: string;
        if (insertLine >= lines.length) {
            newContent = content.trimEnd() + "\n\n" + block + "\n";
        } else {
            const before = lines.slice(0, insertLine).join("\n");
            const after = lines.slice(insertLine + 1).join("\n");
            newContent =
                (before ? before + "\n" : "") +
                "\n" +
                block +
                "\n" +
                (after ? after : "");
        }

        await app.vault.modify(activeFile, newContent);
        const newLines = newContent.split("\n");
        const blockLineCount = block.split("\n").length + 2;
        const newCursorLine = Math.min(
            insertLine + blockLineCount,
            newLines.length - 1,
        );
        editor.setCursor(newCursorLine, 0);
    } else {
        await app.vault.process(activeFile, (data) => {
            const fm = /^(---\n[\s\S]*?\n---)/.exec(data);
            if (fm) {
                const afterFm = fm.index + fm[0].length;
                return (
                    data.slice(0, afterFm) +
                    "\n\n" +
                    block +
                    "\n" +
                    data.slice(afterFm)
                );
            }
            return "\n" + block + "\n" + data;
        });
    }

    plugin.notifyFsrsTableRenderers();
    return true;
}

/**
 * Вставляет дефолтный блок `fsrs-table` в позицию курсора.
 */
export async function insertDefaultTable(
    app: App,
    plugin: FsrsPlugin,
    editor?: Editor,
): Promise<void> {
    const file = app.workspace.getActiveFile();
    verboseLog("Команда: Вставить дефолтный fsrs-table для файла", file?.name);
    try {
        await insertBlock(app, plugin, DEFAULT_TABLE_BLOCK, editor);
        if (file)
            verboseLog("Дефолтный fsrs-table успешно добавлен в", file.name);
    } catch (error) {
        console.error("Ошибка при вставке дефолтного fsrs-table:", error);
        showNotice("notices.card_processing_error");
    }
}
