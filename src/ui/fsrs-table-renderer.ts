import { MarkdownRenderChild, Notice } from "obsidian";
import type FsrsPlugin from "../main";
import type { TableParams, TableMode } from "../utils/fsrs-table-helpers";
import {
	parseTableParams,
	generateTableHTMLFromCards,
	generateEmptyTableHTML,
} from "../utils/fsrs-table-helpers";

/**
 * Класс для динамического рендеринга универсального блока fsrs-table
 * Заменяет блоки fsrs-now и fsrs-future, добавляет режим all
 */
export class FsrsTableRenderer extends MarkdownRenderChild {
	private params: TableParams;

	constructor(
		private plugin: FsrsPlugin,
		private container: HTMLElement,
		private sourcePath: string,
		source: string,
	) {
		super(container);
		this.params = parseTableParams(source);
	}

	/**
	 * Вызывается при загрузке компонента
	 */
	onload(): void {
		super.onload();
		// Регистрируем рендерер в плагине для уведомлений об обновлениях
		this.plugin.registerFsrsTableRenderer(this);
		void this.renderContent();
	}

	/**
	 * Вызывается при выгрузке компонента
	 */
	onunload() {
		// Удаляем рендерер из списка активных
		this.plugin.unregisterFsrsTableRenderer(this);
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
				cls: "fsrs-table-loading",
			});
			loadingDiv.createEl("small", {
				text: "Loading fsrs cards...",
			});

			// Получаем все карточки через плагин
			const allCards = await this.plugin.getCardsForReview();
			const now = new Date();

			if (allCards.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Генерируем HTML таблицы
			const html = await generateTableHTMLFromCards(
				allCards,
				this.params,
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
			this.renderErrorState(error);
		} finally {
			const elapsedMs = performance.now() - start;
			const elapsedSec = elapsedMs / 1000;
			console.debug(
				`⏱️ Загрузка таблицы FSRS (режим ${this.params.mode}): ${elapsedSec.toFixed(2)} с`,
			);
		}
	}

	/**
	 * Отображает состояние "нет карточек"
	 */
	private renderEmptyState() {
		this.container.empty();
		const emptyHTML = generateEmptyTableHTML(this.params.mode);
		// eslint-disable-next-line @microsoft/sdl/no-inner-html
		this.container.insertAdjacentHTML("afterbegin", emptyHTML);
	}

	/**
	 * Отображает состояние ошибки
	 */
	private renderErrorState(error: unknown) {
		console.error(
			`Ошибка при рендеринге блока fsrs-table (режим ${this.params.mode}):`,
			error,
		);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		this.container.empty();
		const errorDiv = this.container.createDiv({ cls: "fsrs-table-error" });
		errorDiv.createEl("small", {
			text: `Error loading FSRS table: ${errorMessage}`,
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
		this.container.querySelectorAll(".fsrs-table-row").forEach((row) => {
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
				void new Notice(`File not found: ${filePath}`);
			}
		} catch (error) {
			console.error("Ошибка при открытии файла:", error);
			void new Notice(`Could not open file: ${filePath}`);
		}
	}

	/**
	 * Обновляет содержимое блока (может быть вызвано извне)
	 */
	async refresh() {
		await this.renderContent();
	}

	/**
	 * Возвращает режим отображения этого рендерера
	 */
	getMode(): TableMode {
		return this.params.mode;
	}
}
