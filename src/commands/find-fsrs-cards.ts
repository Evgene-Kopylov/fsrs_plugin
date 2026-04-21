import { showNotice } from "../utils/i18n";
import type FsrsPlugin from "../main";
import { createDefaultTableBlock } from "../utils/fsrs-table-helpers";

/**
 * Команда для поиска карточек FSRS и вставки блока fsrs-table в текущий файл
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function findFsrsCards(plugin: FsrsPlugin): Promise<void> {
    try {
        // Получаем карточки для повторения
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

        // Читаем содержимое активного файла
        const fileContent = await plugin.app.vault.read(activeFile);

        // Ищем существующий блок кода fsrs-table
        const fsrsTableBlockRegex = /```fsrs-table\n([\s\S]*?)\n```/g;
        const defaultBlock = createDefaultTableBlock();

        let newContent: string;

        // Проверяем, есть ли уже блок fsrs-table в файле
        if (fsrsTableBlockRegex.test(fileContent)) {
            // Сбрасываем lastIndex для корректной работы replace
            fsrsTableBlockRegex.lastIndex = 0;
            // Заменяем первый найденный блок на блок по умолчанию
            newContent = fileContent.replace(fsrsTableBlockRegex, defaultBlock);
        } else {
            // Добавляем блок по умолчанию в конец файла
            newContent = fileContent + "\n\n" + defaultBlock;
        }

        // Сохраняем изменения
        await plugin.app.vault.modify(activeFile, newContent);

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
