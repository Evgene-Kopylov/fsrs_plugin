import { MarkdownRenderChild, Notice, TAbstractFile } from "obsidian";
import {
	parseModernFsrsFromFrontmatter,
	extractFrontmatterWithMatch,
	isCardDue,
	computeCardState,
	formatLocalDate,
	updateReviewsInYaml,
	getMinutesSinceLastReview,
	getRussianNoun,
} from "../utils/fsrs-helper";
import type FsrsPlugin from "../main";

/**
 * Рендерер кнопки повторения карточки FSRS для блока `fsrs-review-button`
 * Инкапсулирует всю логику создания и управления кнопкой
 * Интегрируется с Obsidian's Markdown render lifecycle через MarkdownRenderChild
 */
export class ReviewButtonRenderer extends MarkdownRenderChild {
	private mainButton: HTMLButtonElement;
	private deleteButton: HTMLButtonElement;
	private buttonsContainer: HTMLDivElement;
	private currentState:
		| "not-fsrs"
		| "reviewed"
		| "due"
		| "error"
		| "loading" = "loading";
	private fileChangeHandler?: (file: TAbstractFile) => void;

	/**
	 * Создает новый рендерер кнопки
	 * @param plugin - Экземпляр плагина FSRS
	 * @param container - Контейнер для кнопки (div элемент)
	 * @param sourcePath - Путь к файлу, в котором находится блок
	 */
	constructor(
		private plugin: FsrsPlugin,
		container: HTMLElement,
		private sourcePath: string,
	) {
		super(container);

		// Создаем контейнер для кнопок
		this.buttonsContainer = document.createElement("div");
		this.buttonsContainer.className = "fsrs-buttons-container";
		container.appendChild(this.buttonsContainer);

		// Создаем основную кнопку с фиксированной шириной
		this.mainButton = document.createElement("button");
		this.mainButton.className = "fsrs-review-button";

		// Создаем кнопку удаления
		this.deleteButton = document.createElement("button");
		this.deleteButton.className = "fsrs-delete-button";
		this.deleteButton.textContent = "✕";
		this.deleteButton.title = "Delete last review";

		// Добавляем кнопки в контейнер
		this.buttonsContainer.appendChild(this.mainButton);
		this.buttonsContainer.appendChild(this.deleteButton);

		// Устанавливаем фиксированный класс для контейнера
		container.className = "fsrs-review-button-container";
	}

	/**
	 * Вызывается Obsidian при загрузке компонента
	 */
	onload(): void {
		void this.updateButtonState();
		this.setupClickHandlers();
		this.setupFileWatcher();
	}

	/**
	 * Вызывается Obsidian при выгрузке компонента
	 */
	onunload(): void {
		this.cleanup();
		this.removeFileWatcher();
	}

	/**
	 * Обновляет состояние кнопки на основе текущего статуса карточки
	 * Вызывается при инициализации и после повторения карточки
	 */
	private async updateButtonState(): Promise<void> {
		try {
			const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
			if (!file) {
				this.mainButton.textContent = "Файл не найден";
				this.mainButton.disabled = true;
				this.updateButtonClass("error");
				this.deleteButton.disabled = true;
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterMatch = extractFrontmatterWithMatch(content);

			if (!frontmatterMatch) {
				this.mainButton.textContent = "Нет frontmatter";
				this.mainButton.disabled = true;
				this.updateButtonClass("error");
				this.deleteButton.disabled = true;
				return;
			}

			const frontmatter = frontmatterMatch.content;
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				this.sourcePath,
			);

			if (!parseResult.success || !parseResult.card) {
				// Карточка не является FSRS карточкой - кнопка активна, но затемнена
				this.mainButton.textContent = "Not an fsrs card";
				this.mainButton.disabled = false;
				this.updateButtonClass("not-fsrs");
				this.deleteButton.disabled = true; // Нет повторений для удаления
				return;
			}

			const card = parseResult.card;
			const isDue = await isCardDue(card, this.plugin.settings);

			if (!isDue) {
				// Карточка уже повторена - показываем последнюю оценку
				if (card.reviews.length > 0) {
					const lastReview = card.reviews[card.reviews.length - 1];
					if (lastReview) {
						this.mainButton.textContent = `Повторено: ${lastReview.rating}`;
					} else {
						this.mainButton.textContent = "Повторено";
					}
				} else {
					this.mainButton.textContent = "Повторено";
				}
				this.mainButton.disabled = false;
				this.updateButtonClass("reviewed");
			} else {
				// Карточка готова к повторению
				this.mainButton.textContent = "Повторить карточку";
				this.mainButton.disabled = false;
				this.updateButtonClass("due");
			}

			// Кнопка удаления активна только если есть повторения
			this.deleteButton.disabled = card.reviews.length === 0;
		} catch (error) {
			console.error("Ошибка при обновлении состояния кнопки:", error);
			this.mainButton.textContent = "Ошибка загрузки";
			this.mainButton.disabled = true;
			this.updateButtonClass("error");
			this.deleteButton.disabled = true;
		}
	}

	/**
	 * Обновляет CSS класс кнопки в зависимости от состояния
	 */
	private updateButtonClass(
		state: "not-fsrs" | "reviewed" | "due" | "error" | "loading",
	): void {
		this.currentState = state;

		// Удаляем все классы состояний
		this.mainButton.classList.remove(
			"fsrs-review-button--not-fsrs",
			"fsrs-review-button--reviewed",
			"fsrs-review-button--due",
			"fsrs-review-button--error",
			"fsrs-review-button--loading",
		);

		// Добавляем текущий класс состояния
		this.mainButton.classList.add(`fsrs-review-button--${state}`);
	}

	/**
	 * Настраивает обработчики клика на кнопках
	 */
	private setupClickHandlers(): void {
		// Основная кнопка
		const mainClickHandler = () => {
			void this.handleMainButtonClick();
		};
		this.mainButton.addEventListener("click", mainClickHandler);
		(
			this.mainButton as HTMLElement & {
				_clickHandler?: typeof mainClickHandler;
			}
		)._clickHandler = mainClickHandler;

		// Кнопка удаления
		const deleteClickHandler = () => {
			void this.handleDeleteButtonClick();
		};
		this.deleteButton.addEventListener("click", deleteClickHandler);
		(
			this.deleteButton as HTMLElement & {
				_clickHandler?: typeof deleteClickHandler;
			}
		)._clickHandler = deleteClickHandler;
	}

	/**
	 * Очищает обработчики событий
	 */
	private cleanup(): void {
		const mainButtonWithHandler = this.mainButton as HTMLElement & {
			_clickHandler?: () => Promise<void>;
		};
		if (this.mainButton && mainButtonWithHandler._clickHandler) {
			const handler = mainButtonWithHandler._clickHandler as (
				ev: Event,
			) => void;
			this.mainButton.removeEventListener("click", handler);
			delete mainButtonWithHandler._clickHandler;
		}

		const deleteButtonWithHandler = this.deleteButton as HTMLElement & {
			_clickHandler?: () => Promise<void>;
		};
		if (this.deleteButton && deleteButtonWithHandler._clickHandler) {
			const handler = deleteButtonWithHandler._clickHandler as (
				ev: Event,
			) => void;
			this.deleteButton.removeEventListener("click", handler);
			delete deleteButtonWithHandler._clickHandler;
		}
	}

	/**
	 * Обрабатывает клик на основной кнопке
	 */
	private async handleMainButtonClick(): Promise<void> {
		try {
			// Блокируем кнопки на время обработки
			this.mainButton.disabled = true;
			this.deleteButton.disabled = true;

			// Проверяем статус карточки перед открытием модального окна
			const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
			if (!file) {
				new Notice("Файл не найден");
				await this.updateButtonState();
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterMatch = extractFrontmatterWithMatch(content);

			if (!frontmatterMatch) {
				new Notice("Файл не содержит frontmatter");
				await this.updateButtonState();
				return;
			}

			const frontmatter = frontmatterMatch.content;
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				this.sourcePath,
			);

			if (!parseResult.success || !parseResult.card) {
				// Карточка не является FSRS карточкой - показываем уведомление
				new Notice("Not an fsrs card");
				// Обновляем состояние кнопки (на случай, если статус изменился)
				await this.updateButtonState();
				return;
			}

			const card = parseResult.card;
			const isDue = await isCardDue(card, this.plugin.settings);

			if (!isDue) {
				// Карточка не готова к повторению - проверяем возможность досрочного повторения
				const minutesSinceLastReview = getMinutesSinceLastReview(card);
				const minInterval =
					this.plugin.settings.minimum_review_interval_minutes;

				if (minutesSinceLastReview >= minInterval) {
					// Достаточно времени прошло - разрешаем досрочное повторение
					console.debug(
						`Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
					);
					// Продолжаем показ модального окна
				} else {
					// Недостаточно времени прошло - показываем информацию
					const remainingMinutes =
						minInterval - minutesSinceLastReview;
					const state = await computeCardState(
						card,
						this.plugin.settings,
					);
					const nextDate = new Date(state.due);

					let message = `Карточка уже повторена. `;
					if (remainingMinutes > 0) {
						message += `Досрочное повторение возможно через ${remainingMinutes} ${getRussianNoun(remainingMinutes, "минуту", "минуты", "минут")}. `;
					}
					message += `Следующее повторение по графику: ${formatLocalDate(nextDate, this.plugin.app)}`;

					new Notice(message);
					await this.updateButtonState();
					return;
				}
			}

			// Карточка готова к повторению - вызываем стандартный ревью
			const rating = await this.plugin.reviewCardByPath(this.sourcePath);

			if (rating) {
				// После успешного ревью сразу обновляем состояние кнопки
				await this.updateButtonState();
			} else {
				// Ревью отменено - восстанавливаем состояние
				await this.updateButtonState();
			}
		} catch (error) {
			console.error("Ошибка при обработке карточки:", error);
			new Notice("Ошибка при обработке карточки");
			// Восстанавливаем состояние при ошибке
			await this.updateButtonState();
		}
	}

	/**
	 * Обрабатывает клик на кнопке удаления
	 */
	private async handleDeleteButtonClick(): Promise<void> {
		try {
			// Блокируем кнопки на время обработки
			this.mainButton.disabled = true;
			this.deleteButton.disabled = true;

			const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
			if (!file) {
				new Notice("Файл не найден");
				await this.updateButtonState();
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterMatch = extractFrontmatterWithMatch(content);

			if (!frontmatterMatch) {
				new Notice("Файл не содержит frontmatter");
				await this.updateButtonState();
				return;
			}

			const frontmatter = frontmatterMatch.content;
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				this.sourcePath,
			);

			if (!parseResult.success || !parseResult.card) {
				new Notice("Not an fsrs card. Nothing to delete.");
				await this.updateButtonState();
				return;
			}

			const card = parseResult.card;

			// Проверяем, есть ли что удалять
			if (card.reviews.length === 0) {
				new Notice("Нет повторений для удаления");
				await this.updateButtonState();
				return;
			}

			// Удаляем последнее повторение
			const updatedReviews = [...card.reviews];
			updatedReviews.pop();

			// Обновляем frontmatter
			const updatedFrontmatter = updateReviewsInYaml(
				frontmatter,
				updatedReviews,
			);

			// Собираем обновленное содержимое файла
			const beforeFrontmatter = content.substring(
				0,
				frontmatterMatch.match.index,
			);
			const afterFrontmatter = content.substring(
				frontmatterMatch.match.index + frontmatterMatch.match[0].length,
			);
			const newContent =
				beforeFrontmatter +
				"---\n" +
				updatedFrontmatter +
				"\n---" +
				afterFrontmatter;

			// Сохраняем изменения
			await this.plugin.app.vault.modify(file, newContent);

			new Notice("Последнее повторение удалено");
			this.plugin.notifyFsrsNowRenderers();
			this.plugin.notifyFsrsFutureRenderers();
			await this.updateButtonState();
		} catch (error) {
			console.error("Ошибка при удалении повторения:", error);
			new Notice("Ошибка при удалении повторения");
			// Восстанавливаем состояние при ошибке
			await this.updateButtonState();
		}
	}

	/**
	 * Настраивает отслеживание изменений файла
	 */
	private setupFileWatcher(): void {
		this.fileChangeHandler = (file: TAbstractFile) => {
			if (file.path === this.sourcePath) {
				void this.refresh();
			}
		};
		this.plugin.app.vault.on("modify", this.fileChangeHandler);
	}

	private removeFileWatcher(): void {
		if (this.fileChangeHandler) {
			this.plugin.app.vault.off("modify", this.fileChangeHandler);
			this.fileChangeHandler = undefined;
		}
	}

	/**
	 * Обновляет рендерер (например, при изменении файла)
	 * Может быть вызван извне для принудительного обновления
	 */
	private async refresh(): Promise<void> {
		await this.updateButtonState();
	}
}
