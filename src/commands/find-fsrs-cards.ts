import { Notice } from "obsidian";
import type FsrsPlugin from "../main";

/**
 * Команда для поиска карточек FSRS и вставки блока fsrs-now в текущий файл
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

		// Ищем существующий блок кода fsrs-now
		const fsrsNowBlockRegex = /```fsrs-now\n([\s\S]*?)\n```/g;
		const emptyBlock = "```fsrs-now\n```";

		let newContent: string;

		// Проверяем, есть ли уже блок fsrs-now в файле
		if (fsrsNowBlockRegex.test(fileContent)) {
			// Сбрасываем lastIndex для корректной работы replace
			fsrsNowBlockRegex.lastIndex = 0;
			// Заменяем первый найденный блок на пустой
			newContent = fileContent.replace(fsrsNowBlockRegex, emptyBlock);
		} else {
			// Добавляем пустой блок в конец файла
			newContent = fileContent + "\n\n" + emptyBlock;
		}

		// Сохраняем изменения
		await plugin.app.vault.modify(activeFile, newContent);

		if (cardsForReview.length > 0) {
			new Notice(
				`Добавлен блок fsrs-now с ${cardsForReview.length} карточками для повторения`,
			);
		}

		console.debug("Найдено карточек для повторения:", cardsForReview.length);
	} catch (error) {
		console.error("Ошибка при поиске карточек для повторения:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice(
			"Ошибка при поиске карточек для повторения: " + errorMessage,
		);
	}
}
