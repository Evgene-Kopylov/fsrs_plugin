import { MarkdownRenderChild, Notice } from "obsidian";
import type FsrsPlugin from "../main";
import {
	generateFsrsFutureHTML,
	filterCardsForFuture,
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
	onload(): void {
		super.onload();
		this.plugin.registerFsrsFutureRenderer(this);
		void this.renderContent();
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
		const start = performance.now();
		try {
			// Показываем индикатор загрузки
			this.container.empty();
			const loadingDiv = this.container.createDiv({
				cls: "fsrs-future-loading",
			});
			loadingDiv.createEl("small", {
				text: "Loading fsrs cards for future...",
			});

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
			this.container.empty();
			// eslint-disable-next-line @microsoft/sdl/no-inner-html
			this.container.insertAdjacentHTML("afterbegin", html);

			// Добавляем обработчики событий для кликабельных ссылок
			this.addEventListeners();
		} catch (error) {
			void this.renderErrorState(error);
		} finally {
			const elapsedMs = performance.now() - start;
			const elapsedSec = elapsedMs / 1000;
			console.debug(
				`⏱️ Загрузка таблицы FSRS будущего: ${elapsedSec.toFixed(2)} с`,
			);
		}
	}

	/**
	 * Отображает состояние "нет карточек на будущее"
	 */
	private renderEmptyState() {
		this.container.empty();
		const emptyDiv = this.container.createDiv({ cls: "fsrs-future-empty" });
		emptyDiv.createEl("small", { text: "No cards for future" });
	}

	/**
	 * Отображает состояние ошибки
	 */
	private renderErrorState(error: unknown) {
		console.error("Ошибка при рендеринге блока fsrs-future:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		this.container.empty();
		const errorDiv = this.container.createDiv({ cls: "fsrs-future-error" });
		errorDiv.createEl("small", {
			text: `Error loading FSRS cards for future: ${errorMessage}`,
		});
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
					void this.openFile(filePath);
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
					void this.openFile(filePath);
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
			void new Notice(`Не удалось открыть файл: ${filePath}`);
		}
	}

	/**
	 * Обновляет содержимое блока (может быть вызвано извне)
	 */
	async refresh() {
		await this.renderContent();
	}
}
