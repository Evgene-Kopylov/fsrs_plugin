import { Notice } from "obsidian";
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
		const cardsForReview = await plugin.getCardsForReview();

		// Показываем уведомление о количестве найденных карточек
		if (cardsForReview.length === 0) {
			new Notice("Нет карточек для повторения");
		} else {
			new Notice(
				`Найдено ${cardsForReview.length} карточек для повторения`,
			);
		}

		// Получаем активный файл
		const activeFile = plugin.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла для вставки блока кода");
			return;
		}

		// Читаем содержимое активного файла
		const fileContent = await plugin.app.vault.read(activeFile);

		// Ищем существующий блок кода fsrs-table
		const fsrsTableBlockRegex = /```fsrs-table\n([\s\S]*?)\n```/g;
		const defaultBlock = createDefaultTableBlock("due");

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
			new Notice(
				`Добавлен блок fsrs-table с ${cardsForReview.length} карточками для повторения`,
			);
		}

		console.debug(
			"Найдено карточек для повторения:",
			cardsForReview.length,
		);
	} catch (error) {
		console.error("Ошибка при поиске карточек для повторения:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice(
			"Ошибка при поиске карточек для повторения: " + errorMessage,
		);
	}
}
