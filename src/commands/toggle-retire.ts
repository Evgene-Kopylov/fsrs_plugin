import { App } from "obsidian";
import { showNotice } from "../utils/notice";
import {
    extractFrontmatterWithMatch,
    updateFrontmatterInContent,
    isFrontmatterRetired,
    RETIRED_YAML_KEY,
} from "../utils/fsrs/fsrs-frontmatter";
import { shouldIgnoreFileWithSettings } from "../utils/fsrs/fsrs-filter";
import type { FsrsPluginSettings } from "../settings/types";

/**
 * Выводит текущую карточку из повторений (добавляет `fsrs_retired: true`).
 */
export async function retireCurrentCard(
    app: App,
    settings: FsrsPluginSettings,
    rescanFile: (path: string) => Promise<void>,
    notifyRenderers: () => void,
): Promise<void> {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        showNotice("notices.no_active_file");
        return;
    }

    if (
        shouldIgnoreFileWithSettings(
            activeFile.path,
            settings,
            app.vault.configDir,
        )
    ) {
        return;
    }

    const content = await app.vault.read(activeFile);
    const frontmatterMatch = extractFrontmatterWithMatch(content);

    if (frontmatterMatch && isFrontmatterRetired(frontmatterMatch.content)) {
        showNotice("notices.card_already_retired");
        return;
    }

    await app.vault.process(activeFile, (data) => {
        const match = extractFrontmatterWithMatch(data);
        const lines = match ? match.content.split("\n") : [];
        const reviewsIdx = lines.findIndex((l) => /^reviews\s*:/m.test(l));
        const insertIdx = reviewsIdx >= 0 ? reviewsIdx : lines.length;
        lines.splice(insertIdx, 0, `${RETIRED_YAML_KEY}: true`);
        return updateFrontmatterInContent(data, lines.join("\n"));
    });

    await rescanFile(activeFile.path);
    notifyRenderers();
    showNotice("notices.card_retired");
}
