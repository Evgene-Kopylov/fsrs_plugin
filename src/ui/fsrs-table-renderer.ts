import { MarkdownRenderChild, Notice, EventRef } from "obsidian";
import type FsrsPlugin from "../main";
import type { TableParams, TableMode } from "../utils/fsrs-table-helpers";
import {
	parseTableParams,
	generateTableHTMLFromCards,
	generateEmptyTableHTML,
} from "../utils/fsrs-table-helpers";
import { FsrsHelpModal } from "./fsrs-help-modal";

/**
 * Класс для динамического рендеринга универсального блока fsrs-table
 * Поддерживает режимы отображения: due (просроченные), future (будущие), all (все карточки)
 */
export class FsrsTableRenderer extends MarkdownRenderChild {
	private params: TableParams;
	private isFirstLoad = true;
	private activeLeafHandler?: EventRef;
	private activeLeafCallback?: () => void;
	private lastVisibilityUpdate = 0;

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

		// Регистрируем обработчик для обновления таблицы при возвращении видимости
		this.activeLeafCallback = () => {
			this.updateIfVisible().catch((error) => {
				console.error(
					"Ошибка при обновлении таблицы при возвращении видимости:",
					error,
				);
			});
		};
		this.activeLeafHandler = this.plugin.app.workspace.on(
			"active-leaf-change",
			this.activeLeafCallback,
		);

		void (async () => {
			await this.renderContent();
			this.isFirstLoad = false;
		})();
	}

	/**
	 * Вызывается при выгрузке компонента
	 */
	onunload() {
		// Удаляем обработчик активного листа
		if (this.activeLeafCallback) {
			this.plugin.app.workspace.off(
				"active-leaf-change",
				this.activeLeafCallback,
			);
			this.activeLeafCallback = undefined;
			this.activeLeafHandler = undefined;
		}

		// Удаляем рендерер из списка активных
		this.plugin.unregisterFsrsTableRenderer(this);
		super.onunload();
	}

	/**
	 * Основной метод рендеринга контента с поддержкой плавной анимации
	 */
	private async renderContent() {
		const start = performance.now();
		try {
			// При первом показе используем индикатор загрузки
			if (this.isFirstLoad) {
				this.showLoadingIndicator();
			} else {
				// При последующих обновлениях применяем плавную анимацию opacity
				this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
				this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			}

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

			// Очищаем контейнер и вставляем новый HTML
			this.container.empty();
			// eslint-disable-next-line @microsoft/sdl/no-inner-html
			this.container.insertAdjacentHTML("afterbegin", html);

			// Добавляем обработчики событий для кликабельных ссылок
			this.addEventListeners();

			// Восстанавливаем полную прозрачность после обновления
			if (!this.isFirstLoad) {
				this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			}

			// Обновляем время последнего обновления
			this.lastVisibilityUpdate = Date.now();
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
	 * Показывает индикатор загрузки (только при первом отображении)
	 */
	private showLoadingIndicator() {
		this.container.empty();
		const loadingDiv = this.container.createDiv({
			cls: "fsrs-table-loading",
		});
		loadingDiv.createEl("small", {
			text: "Loading fsrs cards...",
		});
	}

	/**
	 * Отображает состояние "нет карточек"
	 */
	private renderEmptyState() {
		// При пустом состоянии также применяем анимацию, если это не первый показ
		if (!this.isFirstLoad) {
			this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
		this.container.empty();

		const emptyHTML = generateEmptyTableHTML(this.params.mode);
		// eslint-disable-next-line @microsoft/sdl/no-inner-html
		this.container.insertAdjacentHTML("afterbegin", emptyHTML);

		if (!this.isFirstLoad) {
			this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
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

		// При ошибке также применяем анимацию, если это не первый показ
		if (!this.isFirstLoad) {
			this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
		this.container.empty();

		const errorDiv = this.container.createDiv({ cls: "fsrs-table-error" });
		errorDiv.createEl("small", {
			text: `Error loading FSRS table: ${errorMessage}`,
		});

		if (!this.isFirstLoad) {
			this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
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

		// Обработчик для кнопки помощи
		this.container
			.querySelectorAll(".fsrs-help-toggle")
			.forEach((button) => {
				button.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.showHelpModal();
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
	 * Обновляет содержимое блока с поддержкой анимации
	 * Может быть вызвано извне для принудительного обновления
	 */
	async refresh() {
		await this.renderContent();
	}

	/**
	 * Обновляет таблицу, если файл активен и прошло достаточно времени
	 */
	private async updateIfVisible(): Promise<void> {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile || activeFile.path !== this.sourcePath) {
			return;
		}

		// Дебаунс: обновляем не чаще чем..
		const now = Date.now();
		if (now - this.lastVisibilityUpdate > 2000) {
			this.lastVisibilityUpdate = now;
			await this.refresh();
		}
	}

	/**
	 * Возвращает режим отображения этого рендерера
	 */
	getMode(): TableMode {
		return this.params.mode;
	}

	/**
	 * Показывает модальное окно со справкой по синтаксису
	 */
	private showHelpModal() {
		const modal = new FsrsHelpModal(this.plugin.app);
		modal.show();
	}
}
