import { App, Editor } from "obsidian";
import type FsrsPlugin from "../main";
import { showNotice } from "../utils/notice";
import { verboseLog } from "../utils/logger";
import { insertBlock } from "./add-default-table";

const HEATMAP_BLOCK = "```fsrs-heatmap\n```\n";

/**
 * Вставляет блок `fsrs-heatmap` в позицию курсора.
 * Использует insertBlock из add-default-table.
 */
export async function insertHeatmap(
    app: App,
    plugin: FsrsPlugin,
    editor?: Editor,
): Promise<void> {
    const file = app.workspace.getActiveFile();
    verboseLog("Команда: Вставить fsrs-heatmap в", file?.name);
    try {
        await insertBlock(app, plugin, HEATMAP_BLOCK, editor);
        if (file) verboseLog("fsrs-heatmap добавлен в", file.name);
    } catch (error) {
        console.error("Ошибка при вставке fsrs-heatmap:", error);
        showNotice("notices.card_processing_error");
    }
}
