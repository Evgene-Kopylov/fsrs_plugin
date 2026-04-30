import { App, Editor } from "obsidian";
import type FsrsPlugin from "../main";
import { showNotice } from "../utils/notice";
import { verboseLog } from "../utils/logger";

/**
 * Дефолтный блок fsrs-table
 */
export const DEFAULT_TABLE_BLOCK =
    '```fsrs-table\nSELECT file as " ", difficulty as "D",\n       stability as "S", retrievability as "R",\n       due as "Следующее"\nLIMIT 20\n```\n';

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
 * Вставляет дефолтный блок `fsrs-table` в позицию курсора.
 * Находит ближайшую пустую строку, вставляет туда с отступами.
 */
export async function insertDefaultTable(
    app: App,
    plugin: FsrsPlugin,
    editor?: Editor,
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

        // Если есть редактор — вставляем по курсору
        if (editor) {
            const cursor = editor.getCursor();
            const content = await app.vault.read(activeFile);
            const lines = content.split("\n");
            const insertLine = findInsertLine(lines, cursor.line);

            // Формируем новый контент
            let newContent: string;
            if (insertLine >= lines.length) {
                // Нет пустой строки ниже — добавляем в конец файла
                newContent =
                    content.trimEnd() + "\n\n" + DEFAULT_TABLE_BLOCK + "\n";
            } else {
                // Вставляем блок на найденную пустую строку
                const before = lines.slice(0, insertLine).join("\n");
                const after = lines.slice(insertLine + 1).join("\n");
                newContent =
                    (before ? before + "\n" : "") +
                    "\n" +
                    DEFAULT_TABLE_BLOCK +
                    "\n" +
                    (after ? after : "");
            }

            await app.vault.modify(activeFile, newContent);

            // Ставим курсор после вставленного блока
            const newLines = newContent.split("\n");
            const blockLineCount = DEFAULT_TABLE_BLOCK.split("\n").length + 2; // +2 за пустые строки
            const newCursorLine = Math.min(
                insertLine + blockLineCount,
                newLines.length - 1,
            );
            editor.setCursor(newCursorLine, 0);
        } else {
            // Нет редактора — старый fallback: в начало файла
            await app.vault.process(activeFile, (data) => {
                const frontmatterMatch = /^(---\n[\s\S]*?\n---)/.exec(data);
                if (frontmatterMatch) {
                    const afterFm =
                        frontmatterMatch.index + frontmatterMatch[0].length;
                    return (
                        data.slice(0, afterFm) +
                        "\n\n" +
                        DEFAULT_TABLE_BLOCK +
                        "\n" +
                        data.slice(afterFm)
                    );
                }
                return "\n" + DEFAULT_TABLE_BLOCK + "\n" + data;
            });
        }

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
