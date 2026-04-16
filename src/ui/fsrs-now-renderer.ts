import { MarkdownRenderChild, Notice } from "obsidian";
import type FsrsPlugin from "../main";
import {
	generateFsrsNowHTML,
	sortCardsByPriority,
	filterCardsForReview,
	isCardDue,
	computeCardState,
	formatLocalDate,
	parseModernFsrsFromFrontmatter,
	extractFrontmatterWithMatch,
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
	onload(): void {
		super.onload();
		this.plugin.registerFsrsNowRenderer(this);
		void this.renderContent();
	}

	/**
	 * Вызывается при выгрузке компонента
	 */
	onunload() {
		this.plugin.unregisterFsrsNowRenderer(this);
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
				cls: "fsrs-now-loading",
			});
			loadingDiv.createEl("small", {
				text: "Loading FSRS cards...",
			});

			// Получаем карточки для повторения через плагин
			const cardsForReview = await this.plugin.getCardsForReview();
			const now = new Date();

			// Фильтруем и сортируем карточки
			const dueCards = await filterCardsForReview(
				cardsForReview,
				this.plugin.settings,
				now,
			);
			await sortCardsByPriority(dueCards, this.plugin.settings, now);

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
				`⏱️ Загрузка таблицы FSRS: ${elapsedSec.toFixed(2)} с`,
			);
		}
	}

	/**
	 * Отображает состояние "нет карточек для повторения"
	 */
	private renderEmptyState() {
		this.container.empty();
		const emptyDiv = this.container.createDiv({ cls: "fsrs-now-empty" });
		emptyDiv.createEl("small", {
			text: "No cards for review 🎉",
		});
	}

	/**
	 * Отображает состояние ошибки
	 */
	private renderErrorState(error: unknown) {
		console.error("Ошибка при рендеринге блока fsrs-now:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		this.container.empty();
		const errorDiv = this.container.createDiv({ cls: "fsrs-now-error" });
		errorDiv.createEl("small", {
			text: `Error loading FSRS cards: ${errorMessage}`,
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
		this.container.querySelectorAll(".fsrs-now-row").forEach((row) => {
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
				void new Notice(`File not found`);
			}
		} catch (error) {
			console.error("Ошибка при открытии файла:", error);
			void new Notice(`Could not open file`);
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
				void new Notice("File not found");
				return;
			}

			const content = await this.plugin.app.vault.read(file);
			const frontmatterMatch = extractFrontmatterWithMatch(content);

			if (!frontmatterMatch) {
				void new Notice("File does not contain frontmatter");
				return;
			}

			const frontmatter = frontmatterMatch.content;
			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				filePath,
			);

			if (!parseResult.success || !parseResult.card) {
				void new Notice("Not an FSRS card");
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
				void new Notice(
					`Card already reviewed. Next review: ${formatLocalDate(nextDate, this.plugin.app)}`,
				);
				return;
			}

			// Карточка готова к повторению - вызываем стандартный ревью
			const rating = await this.plugin.reviewCardByPath(filePath);

			if (rating) {
				// После успешного повторения обновляем отображение
				await this.refresh();
				void new Notice(`Card reviewed with rating: ${rating}`);
			}
		} catch (error) {
			console.error("Ошибка при повторении карточки:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			void new Notice(`Error reviewing card: ${errorMessage}`);
		}
	}
}
