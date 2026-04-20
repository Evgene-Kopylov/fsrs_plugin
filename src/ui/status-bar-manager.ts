import { App, Component, TFile, Menu } from "obsidian";
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
import { FsrsHelpModal } from "./fsrs-help-modal";
import { showReviewHistoryForCurrentFile } from "./review-history-modal";

/**
 * Менеджер статус-бара FSRS для управления отображением статуса текущей карточки
 * в нижней строке состояния Obsidian
 */
export class StatusBarManager extends Component {
    private statusBarItem: HTMLElement | null = null;
    private iconSpan: HTMLSpanElement | null = null;
    private textSpan: HTMLSpanElement | null = null;

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
        this.statusBarItem.style.opacity = "1";
        const icon = this.settings.status_bar_icon || "🔄";
        this.iconSpan = document.createElement("span");
        this.iconSpan.textContent = icon;
        this.textSpan = document.createElement("span");
        this.textSpan.textContent = " FSRS: loading...";
        this.statusBarItem.appendChild(this.iconSpan);
        this.statusBarItem.appendChild(this.textSpan);
        this.statusBarItem.title =
            "FSRS Plugin - Left-click to review, right-click for menu";
        this.statusBarItem.addEventListener("click", (event) => {
            event.preventDefault();
            void this.plugin.reviewCurrentCard();
        });
        this.statusBarItem.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle("Добавить поля FSRS в шапку файла")
                    .setIcon("plus")
                    .onClick(() => {
                        void this.plugin.addFsrsFieldsToCurrentFile();
                    });
            });

            menu.addItem((item) => {
                item.setTitle("Показать историю повторений")
                    .setIcon("clock")
                    .onClick(() => {
                        void showReviewHistoryForCurrentFile(this.app);
                    });
            });

            menu.addItem((item) => {
                item.setTitle("Показать справку по синтаксису fsrs-table")
                    .setIcon("help")
                    .onClick(() => {
                        new FsrsHelpModal(this.app).show();
                    });
            });

            menu.showAtMouseEvent(event);
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
    public async updateStatusBar(): Promise<void> {
        if (!this.statusBarItem) return;

        const file = this.app.workspace.getActiveFile();
        console.debug(
            "Обновление статус-бара для файла:",
            file?.path || "нет файла",
        );
        if (!file) {
            const icon = this.settings.status_bar_icon || "🔄";
            if (this.iconSpan) this.iconSpan.textContent = icon;
            if (this.textSpan) this.textSpan.textContent = " FSRS: No file";
            this.statusBarItem.title = "FSRS Plugin - No active file";
            if (this.iconSpan) this.iconSpan.style.opacity = "0.3";
            console.debug("Статус-бар: нет активного файла");
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const frontmatter = extractFrontmatter(content);

            if (!frontmatter) {
                const icon = this.settings.status_bar_icon || "🔄";
                if (this.iconSpan) this.iconSpan.textContent = icon;
                if (this.textSpan)
                    this.textSpan.textContent = " FSRS: Not FSRS";
                this.statusBarItem.title =
                    "FSRS Plugin - Current file is not a FSRS card";
                if (this.iconSpan) this.iconSpan.style.opacity = "0.3";
                console.debug("Статус-бар: файл не содержит frontmatter");
                return;
            }

            const parseResult = parseModernFsrsFromFrontmatter(
                frontmatter,
                file.path,
            );
            if (!parseResult.success || !parseResult.card) {
                const icon = this.settings.status_bar_icon || "🔄";
                if (this.iconSpan) this.iconSpan.textContent = icon;
                if (this.textSpan)
                    this.textSpan.textContent = " FSRS: Not FSRS";
                this.statusBarItem.title =
                    "FSRS Plugin - Current file is not a FSRS card";
                if (this.iconSpan) this.iconSpan.style.opacity = "0.3";
                console.debug("Статус-бар: файл не является FSRS карточкой");
                return;
            }

            const card = parseResult.card;
            const isDue = await isCardDue(card, this.settings);
            const icon = this.settings.status_bar_icon || "🔄";
            if (this.iconSpan) this.iconSpan.textContent = icon;
            if (this.iconSpan) this.iconSpan.style.opacity = "1";

            if (isDue) {
                if (this.textSpan) this.textSpan.textContent = " FSRS: Due!";
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
                    if (this.textSpan)
                        this.textSpan.textContent = ` FSRS: Wait ${remainingMinutes} ${noun}`;
                    this.statusBarItem.title = `FSRS Plugin - Early review available in ${remainingMinutes} ${noun}. Next scheduled review: ${formattedDate}`;
                } else {
                    if (this.textSpan)
                        this.textSpan.textContent = ` FSRS: ${formattedDate}`;
                    this.statusBarItem.title = `FSRS Plugin - Next review: ${formattedDate}`;
                }
            }
        } catch (error) {
            console.error("Ошибка при обновлении статус-бара:", error);
            const icon = this.settings.status_bar_icon || "🔄";
            if (this.iconSpan) this.iconSpan.textContent = icon;
            if (this.textSpan) this.textSpan.textContent = " FSRS: Error";
            this.statusBarItem.title = "FSRS Plugin - Error updating status";
            if (this.iconSpan) this.iconSpan.style.opacity = "1";
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
        this.iconSpan = null;
        this.textSpan = null;
        super.onunload();
    }
}
