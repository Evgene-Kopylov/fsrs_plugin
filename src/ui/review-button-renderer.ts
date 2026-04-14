import { MarkdownRenderChild, Notice } from "obsidian";
import {
	parseModernFsrsFromFrontmatter,
	isCardDue,
	computeCardState,
	formatLocalDate,
} from "../utils/fsrs-helper";
import type FsrsPlugin from "../main";
import type { ModernFSRSCard } from "../interfaces/fsrs";

/**
 * Рендерер кнопки повторения карточки FSRS для блока `fsrs-review-button`
 * Инкапсулирует всю логику создания и управления кнопкой
 * Интегрируется с Obsidian's Markdown render lifecycle через MarkdownRenderChild
 */
export class ReviewButtonRenderer extends MarkdownRenderChild {
	private button: HTMLButtonElement;
	private currentState:
		| "not-fsrs"
		| "reviewed"
		| "due"
		| "error"
		| "loading" = "loading";
	private fileChangeHandler?: (file: any) => void;

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

		this.button = document.createElement("button");
		this.button.className = "fsrs-review-button";
		container.className = "fsrs-review-button-container";
		container.appendChild(this.button);
	}

	/**
	 * Вызывается Obsidian при загрузке компонента
	 */
	async onload(): Promise<void> {
		await this.updateButtonState();
		this.setupClickHandler();
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
				this.button.textContent = "Файл не найден";
				this.button.disabled = true;
				this.updateButtonClass("error");
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
			const match = frontmatterRegex.exec(content);

			if (!match || !match[1]) {
				this.button.textContent = "Нет frontmatter";
				this.button.disabled = true;
				this.updateButtonClass("error");
				return;
			}

			const frontmatter = match[1];
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				this.sourcePath,
			);

			if (!parseResult.success || !parseResult.card) {
				// Карточка не является FSRS карточкой - кнопка активна, но затемнена
				this.button.textContent = "Не FSRS карточка";
				this.button.disabled = false;
				this.updateButtonClass("not-fsrs");
				return;
			}

			const card = parseResult.card;
			const isDue = await isCardDue(card, this.plugin.settings);

			if (!isDue) {
				// Карточка уже повторена - показываем последнюю оценку
				if (card.reviews.length > 0) {
					const lastReview = card.reviews[card.reviews.length - 1];
					if (lastReview) {
						this.button.textContent = `Повторено: ${lastReview.rating}`;
					} else {
						this.button.textContent = "Повторено";
					}
				} else {
					this.button.textContent = "Повторено";
				}
				this.button.disabled = false;
				this.updateButtonClass("reviewed");
			} else {
				// Карточка готова к повторению
				this.button.textContent = "Повторить карточку";
				this.button.disabled = false;
				this.updateButtonClass("due");
			}
		} catch (error) {
			console.error("Ошибка при обновлении состояния кнопки:", error);
			this.button.textContent = "Ошибка загрузки";
			this.button.disabled = true;
			this.updateButtonClass("error");
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
		this.button.classList.remove(
			"fsrs-review-button--not-fsrs",
			"fsrs-review-button--reviewed",
			"fsrs-review-button--due",
			"fsrs-review-button--error",
			"fsrs-review-button--loading",
		);

		// Добавляем текущий класс состояния
		this.button.classList.add(`fsrs-review-button--${state}`);
	}

	/**
	 * Настраивает обработчик клика на кнопке
	 */
	private setupClickHandler(): void {
		// Используем arrow function для сохранения контекста this
		const clickHandler = async () => {
			await this.handleButtonClick();
		};
		this.button.addEventListener("click", clickHandler);
		// Сохраняем ссылку на обработчик для правильной очистки
		(this.button as any)._clickHandler = clickHandler;
	}

	/**
	 * Очищает обработчики событий
	 */
	private cleanup(): void {
		if (this.button && (this.button as any)._clickHandler) {
			this.button.removeEventListener(
				"click",
				(this.button as any)._clickHandler,
			);
			delete (this.button as any)._clickHandler;
		}
	}

	/**
	 * Обрабатывает клик на кнопке
	 */
	private async handleButtonClick(): Promise<void> {
		try {
			// Блокируем кнопку на время обработки
			this.button.disabled = true;

			// Проверяем статус карточки перед открытием модального окна
			const file = this.plugin.app.vault.getFileByPath(this.sourcePath);
			if (!file) {
				new Notice("Файл не найден");
				await this.updateButtonState();
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
			const match = frontmatterRegex.exec(content);

			if (!match || !match[1]) {
				new Notice("Файл не содержит frontmatter");
				await this.updateButtonState();
				return;
			}

			const frontmatter = match[1];
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				this.sourcePath,
			);

			if (!parseResult.success || !parseResult.card) {
				// Карточка не является FSRS карточкой - показываем уведомление
				new Notice("Не FSRS карточка");
				// Обновляем состояние кнопки (на случай, если статус изменился)
				await this.updateButtonState();
				return;
			}

			const card = parseResult.card;
			const isDue = await isCardDue(card, this.plugin.settings);

			if (!isDue) {
				// Карточка уже повторена - показываем информацию
				const state = await computeCardState(
					card,
					this.plugin.settings,
				);
				const nextDate = new Date(state.due);
				new Notice(
					`Карточка уже повторена. Следующее повторение: ${formatLocalDate(nextDate)}`,
				);
				await this.updateButtonState();
				return;
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
	 * Обновляет рендерер (например, при изменении файла)
	 * Может быть вызван извне для принудительного обновления
	 */
	private setupFileWatcher(): void {
		this.fileChangeHandler = (file: any) => {
			if (file.path === this.sourcePath) {
				this.refresh();
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

	async refresh(): Promise<void> {
		await this.updateButtonState();
	}
}
