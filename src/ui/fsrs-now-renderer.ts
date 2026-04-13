import { MarkdownRenderChild, Notice, Component } from "obsidian";
import type FsrsPlugin from "../main";
import type { FSRSCard } from "../interfaces/fsrs";
import {
	generateFsrsNowHTML,
	sortCardsByPriority,
	filterCardsForReview,
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
		this.container.querySelectorAll(".fsrs-now-link").forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const filePath = (link as HTMLElement).dataset.filePath;
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
}
