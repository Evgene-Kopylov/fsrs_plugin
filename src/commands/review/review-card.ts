import { Notice, App } from "obsidian";
import {
	parseModernFsrsFromFrontmatter,
	addReviewSession,
	getCardYamlAfterReview,
	getNextReviewDates,
} from "../../utils/fsrs-helper";
import type { ModernFSRSCard, FSRSRating } from "../../interfaces/fsrs";
import type MyPlugin from "../../main";
import { ReviewModal } from "./review-modal";

/**
 * Основная функция повторения текущей карточки FSRS
 * @param app - Экземпляр приложения Obsidian
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function reviewCurrentCard(
	app: App,
	plugin: MyPlugin,
): Promise<void> {
	try {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return;
		}

		const content = await app.vault.read(activeFile);

		// Ищем frontmatter
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(content);

		if (!match || !match[1]) {
			new Notice("Файл не содержит frontmatter");
			return;
		}

		const frontmatter = match[1];

		// Парсим карточку в новом формате
		const parseResult = parseModernFsrsFromFrontmatter(
			frontmatter,
			activeFile.path,
		);

		if (!parseResult.success || !parseResult.card) {
			new Notice(
				parseResult.error || "Не удалось распарсить карточку FSRS",
			);
			return;
		}

		const card = parseResult.card;

		console.log("Карточка для повторения:", card);

		// Показываем модальное окно для выбора оценки
		const modal = new ReviewModal(app, plugin, card);
		const rating = await modal.show();

		if (!rating) {
			new Notice("Повторение отменено");
			return;
		}

		console.log("Выбранная оценка:", rating);

		// Добавляем сессию повторения
		const updatedCard = await addReviewSession(
			card,
			rating,
			plugin.settings,
		);

		console.log("Обновленная карточка:", updatedCard);

		// Получаем YAML с обновленными полями
		const updatedYaml = await getCardYamlAfterReview(
			card,
			rating,
			plugin.settings,
		);

		// Заменяем старый frontmatter на новый
		const newContent = content.replace(
			frontmatterRegex,
			"---\n" + updatedYaml + "\n---",
		);

		// Сохраняем изменения
		await app.vault.modify(activeFile, newContent);

		// Получаем следующие даты повторения
		const nextDates = await getNextReviewDates(
			updatedCard,
			plugin.settings,
		);

		// Показываем уведомление с информацией
		let message = `Карточка повторена: ${rating}`;
		if (nextDates[rating]) {
			const nextDate = new Date(nextDates[rating]!);
			message += `\nСледующее повторение: ${nextDate.toLocaleDateString()}`;
		}

		new Notice(message);
		console.log("Карточка успешно обновлена");

		// Логируем следующие даты для всех оценок
		console.log("Следующие даты повторения:");
		Object.entries(nextDates).forEach(([rating, date]) => {
			if (date) {
				console.log(
					`  ${rating}: ${new Date(date as string).toLocaleString()}`,
				);
			}
		});
	} catch (error) {
		console.error("Ошибка при повторении карточки:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice("Ошибка при повторении карточки: " + errorMessage);
	}
}

/**
 * Упрощенная версия для обратной совместимости (использует фиксированную оценку Good)
 * @deprecated Используйте reviewCurrentCard с выбором оценки
 */
export async function reviewCurrentCardSimple(app: App): Promise<void> {
	try {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return;
		}

		const content = await app.vault.read(activeFile);

		// Ищем frontmatter
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(content);

		if (!match || !match[1]) {
			new Notice("Файл не содержит frontmatter");
			return;
		}

		const frontmatter = match[1];

		// Пробуем распарсить в старом формате
		const legacyMatch = /^fsrs_due:/m.test(frontmatter);
		if (legacyMatch) {
			new Notice(
				"Используется старый формат карточки. Обновите карточку.",
			);
			return;
		}

		// Парсим в новом формате
		const parseResult = parseModernFsrsFromFrontmatter(
			frontmatter,
			activeFile.path,
		);

		if (!parseResult.success || !parseResult.card) {
			new Notice(
				parseResult.error || "Не удалось распарсить карточку FSRS",
			);
			return;
		}

		const card = parseResult.card;

		// Используем фиксированную оценку Good
		const rating: FSRSRating = "Good";

		// Для простой версии создаем минимальные настройки
		const defaultSettings = {
			parameters: {
				request_retention: 0.9,
				maximum_interval: 36500,
				enable_fuzz: true,
			},
			default_initial_stability: 0.0,
			default_initial_difficulty: 0.0,
		} as any;

		const updatedCard = await addReviewSession(
			card,
			rating,
			defaultSettings,
		);
		const updatedYaml = await getCardYamlAfterReview(
			card,
			rating,
			defaultSettings,
		);

		const newContent = content.replace(
			frontmatterRegex,
			"---\n" + updatedYaml + "\n---",
		);

		await app.vault.modify(activeFile, newContent);
		new Notice(`Карточка повторена с оценкой: ${rating}`);
	} catch (error) {
		console.error("Ошибка в упрощенной версии:", error);
		new Notice("Ошибка при повторении карточки");
	}
}
