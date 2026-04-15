import { MarkdownRenderChild, Notice } from "obsidian";
import type FsrsPlugin from "../main";
import {
	generateFsrsFutureHTML,
	filterCardsForFuture,
	parseModernFsrsFromFrontmatter,
} from "../utils/fsrs-helper";

/**
 * Класс для динамического рендеринга блока fsrs-future
 * Отображает карточки, запланированные на будущие повторения
 */
export class FsrsFutureRenderer extends MarkdownRenderChild {
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
		super.onload();
		this.plugin.registerFsrsFutureRenderer(this);
		await this.renderContent();
	}

	/**
	 * Вызывается при выгрузке компонента
	 */
	onunload() {
		this.plugin.unregisterFsrsFutureRenderer(this);
		super.onunload();
	}

	/**
	 * Основной метод рендеринга контента
	 */
	private async renderContent() {
		try {
			// Показываем индикатор загрузки
			this.container.innerHTML = `
                <div class="fsrs-future-loading">
                    <small>Загрузка карточек FSRS на будущее...</small>
                </div>
            `;

			// Получаем все карточки через плагин
			const allCards = await this.plugin.getCardsForReview();
			const now = new Date();

			// Фильтруем карточки на будущее
			const futureCards = await filterCardsForFuture(
				allCards,
				this.plugin.settings,
				now,
			);

			if (futureCards.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Генерируем и отображаем HTML
			const html = await generateFsrsFutureHTML(
				futureCards,
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
	 * Отображает состояние "нет карточек на будущее"
	 */
	private renderEmptyState() {
		this.container.innerHTML = `
            <div class="fsrs-future-empty">
                <small>Нет карточек на будущее</small>
            </div>
        `;
	}

	/**
	 * Отображает состояние ошибки
	 */
	private renderErrorState(error: unknown) {
		console.error("Ошибка при рендеринге блока fsrs-future:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		this.container.innerHTML = `
            <div class="fsrs-future-error">
                <small>Ошибка при загрузке карточек FSRS на будущее: ${errorMessage}</small>
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
		this.container.querySelectorAll(".fsrs-future-row").forEach((row) => {
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
}
