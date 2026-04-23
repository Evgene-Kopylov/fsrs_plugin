import { App, Component, TFile, Menu } from "obsidian";
import type FsrsPlugin from "../main";
import type { FsrsPluginSettings } from "../settings";
import {
    parseModernFsrsFromFrontmatter,
    isCardDue,
    computeCardState,
    formatLocalDate,
    getMinutesSinceLastReview,
    extractFrontmatter,
} from "../utils/fsrs-helper";
import { i18n, getLocalizedNoun } from "../utils/i18n";

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

        const icon = this.settings.status_bar_icon || "🔄";
        this.iconSpan = document.createElement("span");
        this.iconSpan.textContent = icon;
        this.textSpan = document.createElement("span");
        this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.loading")}`;
        this.statusBarItem.appendChild(this.iconSpan);
        this.statusBarItem.appendChild(this.textSpan);
        this.statusBarItem.title = i18n.t("statusBar.tooltip.default");
        this.statusBarItem.addEventListener("click", (event) => {
            event.preventDefault();
            void this.plugin.reviewCurrentCard();
        });
        this.statusBarItem.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            const menu = new Menu();

            menu.addItem((item) => {
                item.setTitle(i18n.t("statusBar.menu.add_fields"))
                    .setIcon("plus")
                    .onClick(() => {
                        void this.plugin.addFsrsFieldsToCurrentFile();
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
        console.debug("Updating status bar for file:", file?.path || "no file");
        if (!file) {
            const icon = this.settings.status_bar_icon || "🔄";
            if (this.iconSpan) this.iconSpan.textContent = icon;
            if (this.textSpan)
                this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.no_file")}`;
            this.statusBarItem.title = i18n.t("statusBar.tooltip.no_file");
            if (this.iconSpan)
                this.iconSpan.classList.add("fsrs-status-bar-icon-dimmed");
            console.debug("Status bar: no active file");
            return;
        }

        try {
            const content = await this.app.vault.read(file);
            const frontmatter = extractFrontmatter(content);

            if (!frontmatter) {
                const icon = this.settings.status_bar_icon || "🔄";
                if (this.iconSpan) this.iconSpan.textContent = icon;
                if (this.textSpan)
                    this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.not_fsrs")}`;
                this.statusBarItem.title = i18n.t("statusBar.tooltip.not_fsrs");
                if (this.iconSpan)
                    this.iconSpan.classList.add("fsrs-status-bar-icon-dimmed");
                console.debug("Status bar: file has no frontmatter");
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
                    this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.not_fsrs")}`;
                this.statusBarItem.title = i18n.t("statusBar.tooltip.not_fsrs");
                if (this.iconSpan)
                    this.iconSpan.classList.add("fsrs-status-bar-icon-dimmed");
                console.debug("Status bar: file is not an FSRS card");
                return;
            }

            const card = parseResult.card;
            const isDue = await isCardDue(card, this.settings);
            const icon = this.settings.status_bar_icon || "🔄";
            if (this.iconSpan) this.iconSpan.textContent = icon;
            if (this.iconSpan)
                this.iconSpan.classList.remove("fsrs-status-bar-icon-dimmed");

            if (isDue) {
                if (this.textSpan)
                    this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.due")}`;
                this.statusBarItem.title = i18n.t("statusBar.tooltip.due");
                console.debug("Status bar: card is ready for review");
            } else {
                const state = await computeCardState(card, this.settings);
                console.debug(
                    "Status bar: card already reviewed, next review:",
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
                    const locale = i18n.getLocale();
                    let noun;
                    if (locale === "ru") {
                        noun = getLocalizedNoun(
                            remainingMinutes,
                            "минуту",
                            "минуты",
                            "минут",
                        );
                    } else {
                        noun = getLocalizedNoun(
                            remainingMinutes,
                            "minute",
                            "minutes",
                        );
                    }
                    if (this.textSpan)
                        this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.wait_early", { minutes: remainingMinutes, noun })}`;
                    this.statusBarItem.title = i18n.t(
                        "statusBar.tooltip.early_available",
                        {
                            minutes: remainingMinutes,
                            noun,
                            date: formattedDate,
                        },
                    );
                } else {
                    if (this.textSpan)
                        this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.next_review", { date: formattedDate })}`;
                    this.statusBarItem.title = i18n.t(
                        "statusBar.tooltip.next_scheduled",
                        { date: formattedDate },
                    );
                }
            }
        } catch (error) {
            console.error("Error updating status bar:", error);
            const icon = this.settings.status_bar_icon || "🔄";
            if (this.iconSpan) this.iconSpan.textContent = icon;
            if (this.textSpan)
                this.textSpan.textContent = ` FSRS: ${i18n.t("statusBar.error")}`;
            this.statusBarItem.title = i18n.t("statusBar.tooltip.error");
            if (this.iconSpan)
                this.iconSpan.classList.remove("fsrs-status-bar-icon-dimmed");
            console.debug("Status bar: error updating");
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
