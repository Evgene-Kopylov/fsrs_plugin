import { App, Component, TFile } from "obsidian";
import type FsrsPlugin from "../main";
import type { FsrsPluginSettings } from "../settings";
import {
	parseModernFsrsFromFrontmatter,
	isCardDue,
	computeCardState,
	formatLocalDate,
	getMinutesSinceLastReview,
	getRussianNoun,
	extractFrontmatter,
} from "../utils/fsrs-helper";

/**
 * Менеджер статус-бара FSRS для управления отображением статуса текущей карточки
 * в нижней строке состояния Obsidian
 */
export class StatusBarManager extends Component {
	private statusBarItem: HTMLElement | null = null;

	/**
	 * Создаёт новый менеджер статус-бара
	 * @param plugin - Экземпляр плагина FSRS
	 * @param app - Экземпляр приложения Obsidian
	 * @param settings - Настройки плагина FSRS
	 */
	constructor(
		private plugin: FsrsPlugin,
		private app: App,
		private settings: FsrsPluginSettings,
	) {
		super();
	}

	/**
	 * Инициализирует статус-бар
	 */
	init(): void {
		// Создание элемента статус-бара
		this.statusBarItem = this.plugin.addStatusBarItem();
		this.statusBarItem.classList.add("fsrs-status-bar-item");
		this.statusBarItem.textContent = "FSRS: loading...";
		this.statusBarItem.title = "FSRS Plugin - Click to review current card";
		this.statusBarItem.addEventListener("click", () => {
			void this.plugin.reviewCurrentCard();
		});

		// Подписка на события для обновления статус-бара
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.updateStatusBar();
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file: TFile) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && file.path === activeFile.path) {
					void this.updateStatusBar();
				}
			}),
		);

		// Первоначальное обновление
		void this.updateStatusBar();
	}

	/**
	 * Обновляет статус-бар на основе текущей активной карточки
	 */
	private async updateStatusBar(): Promise<void> {
		if (!this.statusBarItem) return;

		const file = this.app.workspace.getActiveFile();
		console.debug(
			"Обновление статус-бара для файла:",
			file?.path || "нет файла",
		);
		if (!file) {
			this.statusBarItem.textContent = "FSRS: No file";
			this.statusBarItem.title = "FSRS Plugin - No active file";
			console.debug("Статус-бар: нет активного файла");
			return;
		}

		try {
			const content = await this.app.vault.read(file);
			const frontmatter = extractFrontmatter(content);

			if (!frontmatter) {
				this.statusBarItem.textContent = "FSRS: Not FSRS";
				this.statusBarItem.title =
					"FSRS Plugin - Current file is not a FSRS card";
				console.debug("Статус-бар: файл не содержит frontmatter");
				return;
			}

			const parseResult = parseModernFsrsFromFrontmatter(
				frontmatter,
				file.path,
			);
			if (!parseResult.success || !parseResult.card) {
				this.statusBarItem.textContent = "FSRS: Not FSRS";
				this.statusBarItem.title =
					"FSRS Plugin - Current file is not a FSRS card";
				console.debug("Статус-бар: файл не является FSRS карточкой");
				return;
			}

			const card = parseResult.card;
			const isDue = await isCardDue(card, this.settings);

			if (isDue) {
				this.statusBarItem.textContent = "FSRS: Due!";
				this.statusBarItem.title =
					"FSRS Plugin - Card is due for review. Click to review.";
				console.debug("Статус-бар: карточка готова к повторению");
			} else {
				const state = await computeCardState(card, this.settings);
				console.debug(
					"Статус-бар: карточка уже повторена, следующее повторение:",
					state.due,
				);
				const nextDate = new Date(state.due);
				const formattedDate = formatLocalDate(nextDate, this.app);

				// Проверяем, была ли карточка повторена сегодня
				const minutesSinceLastReview = getMinutesSinceLastReview(card);
				const minInterval =
					this.settings.minimum_review_interval_minutes;

				if (
					card.reviews.length > 0 &&
					minutesSinceLastReview < minInterval
				) {
					const remainingMinutes =
						minInterval - minutesSinceLastReview;
					const noun = getRussianNoun(
						remainingMinutes,
						"минуту",
						"минуты",
						"минут",
					);
					this.statusBarItem.textContent = `FSRS: Wait ${remainingMinutes} ${noun}`;
					this.statusBarItem.title = `FSRS Plugin - Early review available in ${remainingMinutes} ${noun}. Next scheduled review: ${formattedDate}`;
				} else {
					this.statusBarItem.textContent = `FSRS: ${formattedDate}`;
					this.statusBarItem.title = `FSRS Plugin - Next review: ${formattedDate}`;
				}
			}
		} catch (error) {
			console.error("Ошибка при обновлении статус-бара:", error);
			this.statusBarItem.textContent = "FSRS: Error";
			this.statusBarItem.title = "FSRS Plugin - Error updating status";
			console.debug("Статус-бар: ошибка при обновлении");
		}
	}

	/**
	 * Уничтожает менеджер статус-бара, очищая ресурсы
	 */
	onunload(): void {
		if (this.statusBarItem) {
			this.statusBarItem.remove();
			this.statusBarItem = null;
		}
		super.onunload();
	}
}
