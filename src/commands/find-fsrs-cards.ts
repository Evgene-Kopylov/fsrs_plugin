import { showNotice } from "../utils/notice";
import type FsrsPlugin from "../main";
import { createDefaultTableBlock } from "../utils/fsrs-table-helpers";

/**
 * Команда для поиска карточек FSRS и вставки блока fsrs-table в текущий файл
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function findFsrsCards(plugin: FsrsPlugin): Promise<void> {
    try {
        // Получаем карточки для повторения (асинхронно, до process)
        const cachedCardsWithState = await plugin.getCachedCardsWithState();
        const cardsForReview = cachedCardsWithState.map((c) => c.card);

        // Показываем уведомление о количестве найденных карточек
        if (cardsForReview.length === 0) {
            showNotice("notices.no_cards_for_review");
        } else {
            showNotice("notices.cards_found", { count: cardsForReview.length });
        }

        // Получаем активный файл
        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        // Атомарная запись через process
        await plugin.app.vault.process(activeFile, (data) => {
            const fsrsTableBlockRegex = /```fsrs-table\n([\s\S]*?)\n```/g;
            const defaultBlock = createDefaultTableBlock();

            if (fsrsTableBlockRegex.test(data)) {
                fsrsTableBlockRegex.lastIndex = 0;
                return data.replace(fsrsTableBlockRegex, defaultBlock);
            } else {
                return data + "\n\n" + defaultBlock;
            }
        });

        if (cardsForReview.length > 0) {
            showNotice("notices.fsrs_table_inserted", {
                count: cardsForReview.length,
            });
        }

        console.debug(
            "Найдено карточек для повторения:",
            cardsForReview.length,
        );
    } catch (error) {
        console.error("Ошибка при поиске карточек для повторения:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
    }
}
