import { Notice } from "obsidian";
import type FsrsPlugin from "../main";
import { filterCardsForFuture } from "../utils/fsrs-helper";

/**
 * Команда для поиска карточек FSRS на будущее и вставки блока fsrs-future в текущий файл
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function findFsrsFutureCards(plugin: FsrsPlugin): Promise<void> {
	try {
		// Получаем все карточки
		const allCards = await plugin.getCardsForReview();
		const now = new Date();

		// Фильтруем карточки на будущее
		const futureCards = await filterCardsForFuture(
			allCards,
			plugin.settings,
			now,
		);

		// Показываем уведомление о количестве найденных карточек
		if (futureCards.length === 0) {
			new Notice("Нет карточек на будущее");
		} else {
			new Notice(
				`Найдено ${futureCards.length} карточек на будущее`,
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

		// Ищем существующий блок кода fsrs-future
		const fsrsFutureBlockRegex = /```fsrs-future\n([\s\S]*?)\n```/g;
		const emptyBlock = "```fsrs-future\n```";

		let newContent: string;

		// Проверяем, есть ли уже блок fsrs-future в файле
		if (fsrsFutureBlockRegex.test(fileContent)) {
			// Сбрасываем lastIndex для корректной работы replace
			fsrsFutureBlockRegex.lastIndex = 0;
			// Заменяем первый найденный блок на пустой
			newContent = fileContent.replace(fsrsFutureBlockRegex, emptyBlock);
		} else {
			// Добавляем пустой блок в конец файла
			newContent = fileContent + "\n\n" + emptyBlock;
		}

		// Сохраняем изменения
		await plugin.app.vault.modify(activeFile, newContent);

		if (futureCards.length > 0) {
			new Notice(
				`Добавлен блок fsrs-future с ${futureCards.length} карточками на будущее`,
			);
		}

		console.log("Найдено карточек на будущее:", futureCards.length);
	} catch (error) {
		console.error("Ошибка при поиске карточек на будущее:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice(
			"Ошибка при поиске карточек на будущее: " + errorMessage,
		);
	}
}
