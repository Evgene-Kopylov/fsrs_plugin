import { MarkdownRenderChild, Notice, Component } from "obsidian";
import type FsrsPlugin from "../main";
import type { FSRSCard } from "../interfaces/fsrs";
import {
	generateFsrsNowHTML,
	sortCardsByPriority,
	filterCardsForReview,
	isCardDue,
	computeCardState,
	formatLocalDate,
	parseModernFsrsFromFrontmatter,
} from "../utils/fsrs-helper";

/**
 * Класс для динамического рендеринга блока fsrs-now
 * Аналогично Journals calendar-timeline - рендерит контент на месте блока кода
 */
export class FsrsNowRenderer extends MarkdownRenderChild {
	constructor(
		private plugin: FsrsPlugin,
		private container: HTMLElement,
		private sourcePath: string,
	) {
		super(container);
	}

	/**
	 * Вызывается при загрузке компонента
	 */
	async onload() {
		await this.renderContent();
	}

	/**
	 * Основной метод рендеринга контента
	 */
	private async renderContent() {
		try {
			// Показываем индикатор загрузки
			this.container.innerHTML = `
                <div class="fsrs-now-loading">
                    <small>Загрузка карточек FSRS...</small>
                </div>
            `;

			// Получаем карточки для повторения через плагин
			const cardsForReview = await this.plugin.getCardsForReview();
			const now = new Date();

			// Фильтруем и сортируем карточки
			const dueCards = await filterCardsForReview(
				cardsForReview,
				this.plugin.settings,
				now,
			);
			const sortedCards = await sortCardsByPriority(
				dueCards,
				this.plugin.settings,
				now,
			);

			if (dueCards.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Генерируем и отображаем HTML
			const html = await generateFsrsNowHTML(
				dueCards,
				this.plugin.settings,
				this.plugin.app,
				now,
			);
			this.container.innerHTML = html;

			// Добавляем обработчики событий для кликабельных ссылок
			this.addEventListeners();
		} catch (error) {
			this.renderErrorState(error);
		}
	}

	/**
	 * Отображает состояние "нет карточек для повторения"
	 */
	private renderEmptyState() {
		this.container.innerHTML = `
            <div class="fsrs-now-empty">
                <small>Нет карточек для повторения 🎉</small>
            </div>
        `;
	}

	/**
	 * Отображает состояние ошибки
	 */
	private renderErrorState(error: unknown) {
		console.error("Ошибка при рендеринге блока fsrs-now:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		this.container.innerHTML = `
            <div class="fsrs-now-error">
                <small>Ошибка при загрузке карточек FSRS: ${errorMessage}</small>
            </div>
        `;
	}

	/**
	 * Добавляет обработчики событий для кликабельных элементов
	 */
	private addEventListeners() {
		// Обработчики для ссылок на файлы
		this.container.querySelectorAll(".internal-link").forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const filePath = (link as HTMLElement).dataset.filePath;
				if (filePath) {
					this.openFile(filePath);
				}
			});
		});

		// Обработчики для строк таблицы (клик на всю строку)
		this.container.querySelectorAll(".fsrs-now-row").forEach((row) => {
			row.addEventListener("click", (e) => {
				// Чтобы не конфликтовать с кликом по ссылке
				if ((e.target as HTMLElement).tagName === "A") return;
				const filePath = (row as HTMLElement).dataset.filePath;
				if (filePath) {
					this.openFile(filePath);
				}
			});
		});
	}

	/**
	 * Открывает файл в Obsidian
	 */
	private async openFile(filePath: string) {
		try {
			const file = this.plugin.app.vault.getFileByPath(filePath);
			if (file) {
				await this.plugin.app.workspace.openLinkText(
					filePath,
					"",
					true,
				);
			} else {
				new Notice(`Файл не найден: ${filePath}`);
			}
		} catch (error) {
			console.error("Ошибка при открытии файла:", error);
			new Notice(`Не удалось открыть файл: ${filePath}`);
		}
	}

	/**
	 * Обновляет содержимое блока (может быть вызвано извне)
	 */
	async refresh() {
		await this.renderContent();
	}

	/**
	 * Повторяет карточку по указанному пути файла
	 */
	private async reviewCard(filePath: string) {
		try {
			// Сначала читаем файл и проверяем статус карточки
			const file = this.plugin.app.vault.getFileByPath(filePath);
			if (!file) {
				new Notice("Файл не найден");
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterRegex = /^---\s*$([\s\S]*?)^---[ \t]*$/m;
			const match = frontmatterRegex.exec(content);

			if (!match || !match[1]) {
				new Notice("Файл не содержит frontmatter");
				return;
			}

			const frontmatter = match[1];
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				filePath,
			);

			if (!parseResult.success || !parseResult.card) {
				new Notice("Не FSRS карточка");
				return;
			}

			const card = parseResult.card;
			const isDue = await isCardDue(card, this.plugin.settings);

			if (!isDue) {
				// Карточка не готова к повторению - показываем информацию
				const state = await computeCardState(
					card,
					this.plugin.settings,
				);
				const nextDate = new Date(state.due);
				new Notice(
					`Карточка уже повторена. Следующее повторение: ${formatLocalDate(nextDate)}`,
				);
				return;
			}

			// Карточка готова к повторению - вызываем стандартный ревью
			const rating = await this.plugin.reviewCardByPath(filePath);

			if (rating) {
				// После успешного повторения обновляем отображение
				await this.refresh();
				new Notice(`Карточка повторена с оценкой: ${rating}`);
			}
		} catch (error) {
			console.error("Ошибка при повторении карточки:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			new Notice(`Ошибка при повторении карточки: ${errorMessage}`);
		}
	}
}
