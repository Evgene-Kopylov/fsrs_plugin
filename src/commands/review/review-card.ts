import { Notice, App } from "obsidian";
import {
	parseModernFsrsFromFrontmatter,
	addReviewSession,
	getNextReviewDates,
	isCardDue,
	computeCardState,
	formatLocalDate,
	updateReviewsInYaml,
	getMinutesSinceLastReview,
	getRussianNoun,
	extractFrontmatterWithMatch,
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
		const frontmatterMatch = extractFrontmatterWithMatch(content);

		if (!frontmatterMatch) {
			new Notice("Файл не содержит frontmatter");
			return;
		}

		const frontmatter = frontmatterMatch.content;

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

		// Проверяем, готова ли карточка к повторению
		const isDue = await isCardDue(card, plugin.settings);

		if (!isDue) {
			// Карточка не готова к повторению - проверяем возможность досрочного повторения
			const minutesSinceLastReview = getMinutesSinceLastReview(card);
			const minInterval = plugin.settings.minimum_review_interval_minutes;

			if (minutesSinceLastReview >= minInterval) {
				// Достаточно времени прошло - разрешаем досрочное повторение
				console.debug(
					`Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
				);
				// Продолжаем показ модального окна
			} else {
				// Недостаточно времени прошло - показываем информацию
				const remainingMinutes = minInterval - minutesSinceLastReview;
				const state = await computeCardState(card, plugin.settings);
				const nextDate = new Date(state.due);

				let message = `Карточка уже повторена. `;
				if (remainingMinutes > 0) {
					message += `Досрочное повторение возможно через ${remainingMinutes} ${getRussianNoun(remainingMinutes, "минуту", "минуты", "минут")}. `;
				}
				message += `Следующее повторение по графику: ${formatLocalDate(nextDate, plugin.app)}`;

				new Notice(message);
				return;
			}
		}

		console.debug("Карточка для повторения:", card);

		// Показываем модальное окно для выбора оценки
		const modal = new ReviewModal(app, plugin, card);
		const rating = await modal.show();

		if (!rating) {
			new Notice("Повторение отменено");
			return;
		}

		console.debug("Выбранная оценка:", rating);

		// Добавляем сессию повторения
		const updatedCard = await addReviewSession(
			card,
			rating,
			plugin.settings,
		);

		console.debug("Обновленная карточка:", updatedCard);

		// Обновляем только поле reviews в YAML
		const updatedYaml = updateReviewsInYaml(
			frontmatter,
			updatedCard.reviews,
		);

		// Заменяем старый frontmatter на новый, сохраняя все остальные поля и пустые строки
		const beforeFrontmatter = content.substring(
			0,
			frontmatterMatch.match.index!,
		);
		const afterFrontmatter = content.substring(
			frontmatterMatch.match.index! + frontmatterMatch.match[0].length,
		);
		const newContent =
			beforeFrontmatter +
			"---\n" +
			updatedYaml +
			"\n---" +
			afterFrontmatter;

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
		plugin.notifyFsrsNowRenderers();
		plugin.notifyFsrsFutureRenderers();
		console.debug("Карточка успешно обновлена");

		// Логируем следующие даты для всех оценок
		console.debug("Следующие даты повторения:");
		Object.entries(nextDates).forEach(([rating, date]) => {
			if (date) {
				console.debug(
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
		const frontmatterMatch = extractFrontmatterWithMatch(content);

		if (!frontmatterMatch) {
			new Notice("Файл не содержит frontmatter");
			return;
		}

		const frontmatter = frontmatterMatch.content;

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
		const updatedYaml = updateReviewsInYaml(
			frontmatter,
			updatedCard.reviews,
		);

		// Заменяем старый frontmatter на новый, сохраняя все остальные поля и пустые строки
		const beforeFrontmatter = content.substring(
			0,
			frontmatterMatch.match.index!,
		);
		const afterFrontmatter = content.substring(
			frontmatterMatch.match.index! + frontmatterMatch.match[0].length,
		);
		const newContent =
			beforeFrontmatter +
			"---\n" +
			updatedYaml +
			"\n---" +
			afterFrontmatter;

		await app.vault.modify(activeFile, newContent);
		new Notice(`Карточка повторена с оценкой: ${rating}`);
	} catch (error) {
		console.error("Ошибка в упрощенной версии:", error);
		new Notice("Ошибка при повторении карточки");
	}
}

/**
 * Повторяет карточку по указанному пути файла
 * Может быть вызвана из frontmatter или других мест
 */
export async function reviewCardByPath(
	app: App,
	plugin: MyPlugin,
	filePath: string,
): Promise<FSRSRating | null> {
	try {
		// Получаем файл по пути
		const file = app.vault.getFileByPath(filePath);
		if (!file) {
			new Notice(`Файл не найден: ${filePath}`);
			return null;
		}

		const content = await app.vault.read(file);

		// Ищем frontmatter
		const frontmatterMatch = extractFrontmatterWithMatch(content);

		if (!frontmatterMatch) {
			new Notice("Файл не содержит frontmatter");
			return null;
		}

		const frontmatter = frontmatterMatch.content;

		// Парсим карточку в новом формате
		const parseResult = parseModernFsrsFromFrontmatter(
			frontmatter,
			filePath,
		);

		if (!parseResult.success || !parseResult.card) {
			new Notice(
				parseResult.error || "Не удалось распарсить карточку FSRS",
			);
			return null;
		}

		const card = parseResult.card;

		// Проверяем, готова ли карточка к повторению
		const isDue = await isCardDue(card, plugin.settings);

		if (!isDue) {
			// Карточка не готова к повторению - проверяем возможность досрочного повторения
			const minutesSinceLastReview = getMinutesSinceLastReview(card);
			const minInterval = plugin.settings.minimum_review_interval_minutes;

			if (minutesSinceLastReview >= minInterval) {
				// Достаточно времени прошло - разрешаем досрочное повторение
				console.debug(
					`Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
				);
				// Продолжаем показ модального окна
			} else {
				// Недостаточно времени прошло - показываем информацию
				const remainingMinutes = minInterval - minutesSinceLastReview;
				const state = await computeCardState(card, plugin.settings);
				const nextDate = new Date(state.due);

				let message = `Карточка уже повторена. `;
				if (remainingMinutes > 0) {
					message += `Досрочное повторение возможно через ${remainingMinutes} ${getRussianNoun(remainingMinutes, "минуту", "минуты", "минут")}. `;
				}
				message += `Следующее повторение по графику: ${formatLocalDate(nextDate, plugin.app)}`;

				new Notice(message);
				return null;
			}
		}

		console.debug("Карточка для повторения:", card);

		// Показываем модальное окно для выбора оценки
		const modal = new ReviewModal(app, plugin, card);
		const rating = await modal.show();

		if (!rating) {
			new Notice("Повторение отменено");
			return null;
		}

		console.debug("Выбранная оценка:", rating);

		// Добавляем сессию повторения
		const updatedCard = await addReviewSession(
			card,
			rating,
			plugin.settings,
		);

		console.debug("Обновленная карточка:", updatedCard);

		// Обновляем только поле reviews в YAML
		const updatedYaml = updateReviewsInYaml(
			frontmatter,
			updatedCard.reviews,
		);

		// Заменяем старый frontmatter на новый, сохраняя все остальные поля и пустые строки
		const beforeFrontmatter = content.substring(
			0,
			frontmatterMatch.match.index!,
		);
		const afterFrontmatter = content.substring(
			frontmatterMatch.match.index! + frontmatterMatch.match[0].length,
		);
		const newContent =
			beforeFrontmatter +
			"---\n" +
			updatedYaml +
			"\n---" +
			afterFrontmatter;

		// Сохраняем изменения
		await app.vault.modify(file, newContent);

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
		plugin.notifyFsrsNowRenderers();
		plugin.notifyFsrsFutureRenderers();
		console.debug("Карточка успешно обновлена");

		// Логируем следующие даты для всех оценок
		console.debug("Следующие даты повторения:");
		Object.entries(nextDates).forEach(([rating, date]) => {
			if (date) {
				console.debug(
					`  ${rating}: ${new Date(date as string).toLocaleString()}`,
				);
			}
		});

		return rating;
	} catch (error) {
		console.error("Ошибка при повторении карточки по пути:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice("Ошибка при повторении карточки: " + errorMessage);
		return null;
	}
}
