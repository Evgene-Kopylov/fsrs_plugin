import { App } from "obsidian";
import type FsrsPlugin from "../main";
import { showNotice } from "../utils/notice";
import { verboseLog } from "../utils/logger";

/**
 * Дефолтный блок fsrs-table
 */
const DEFAULT_TABLE_BLOCK =
    '```fsrs-table\nSELECT file as " ", retrievability as "R",\n       stability as "S", difficulty as "D",\n       overdue as "Overdue"\nLIMIT 20\n```\n';

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
            return "\n" + DEFAULT_TABLE_BLOCK + "\n" + data;
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
