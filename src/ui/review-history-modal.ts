import { Modal, App } from "obsidian";
import { showNotice } from "../utils/notice";
import { i18n } from "../utils/i18n";
import {
    parseModernFsrsFromFrontmatter,
    extractFrontmatter,
    formatLocalDate,
} from "../utils/fsrs-helper";
import type { ModernFSRSCard, FSRSRating } from "../interfaces/fsrs";
import type MyPlugin from "../main";
import { deleteLastReview } from "../commands/review/delete-last-review";

/**
 * Модальное окно для просмотра истории повторений карточки FSRS
 * Отображает таблицу с историей повторений и статистику
 */
export class ReviewHistoryModal extends Modal {
    private card: ModernFSRSCard | null = null;
    private filePath: string;
    private deleteCooldownUntil = 0;

    /**
     * Создает модальное окно для просмотра истории повторений
     * @param app - Экземпляр приложения Obsidian
     * @param filePath - Путь к файлу карточки
     */
    constructor(
        app: App,
        private plugin: MyPlugin,
        filePath: string,
    ) {
        super(app);
        this.filePath = filePath;
    }

    /**
     * Показывает модальное окно с историей повторений
     * @returns Promise<void>
     */
    async show(): Promise<void> {
        // Загружаем данные карточки
        await this.loadCardData();
        if (!this.card) {
            showNotice("notices.card_load_error");
            return;
        }

        this.open();
    }

    /**
     * Загружает данные карточки из файла
     */
    private async loadCardData(): Promise<void> {
        try {
            const file = this.app.vault.getFileByPath(this.filePath);
            if (!file) {
                showNotice("notices.file_not_found", { path: this.filePath });
                return;
            }

            const content = await this.app.vault.read(file);
            const frontmatter = extractFrontmatter(content);

            if (!frontmatter) {
                showNotice("notices.no_frontmatter");
                return;
            }

            const parseResult = parseModernFsrsFromFrontmatter(
                frontmatter,
                this.filePath,
            );

            if (!parseResult.success || !parseResult.card) {
                showNotice("notices.not_fsrs_card");
                return;
            }

            this.card = parseResult.card;
        } catch (error) {
            console.error("Ошибка при загрузке данных карточки:", error);
            showNotice("notices.card_load_error");
        }
    }

    /**
     * Вызывается при открытии модального окна
     */
    onOpen(): void {
        const { contentEl, modalEl } = this;

        // Настраиваем размер модального окна
        modalEl.classList.add("fsrs-history-modal");

        contentEl.empty();

        if (!this.card) {
            contentEl.createEl("p", {
                text: i18n.t("history.error_load"),
            });
            return;
        }

        // Заголовок с именем файла
        const fileName = this.filePath.split("/").pop() || this.filePath;
        contentEl.createEl("h2", {
            text: i18n.t("history.title", { file: fileName }),
            cls: "fsrs-history-title",
        });

        // Информация о файле
        const fileInfo = contentEl.createEl("div", {
            cls: "fsrs-history-file-info",
        });
        fileInfo.createEl("small", {
            text: `${i18n.t("history.file_label")} ${this.filePath}`,
        });

        // Таблица с историей повторений
        this.renderHistoryTable(contentEl);

        // Статистика
        this.renderStatistics(contentEl);
    }

    /**
     * Рендерит таблицу с историей повторений
     */
    private renderHistoryTable(container: HTMLElement): void {
        if (!this.card || this.card.reviews.length === 0) {
            const emptyMessage = container.createEl("p", {
                cls: "fsrs-history-empty",
            });
            emptyMessage.textContent = i18n.t("history.empty");
            return;
        }

        // Создаем контейнер для таблицы с прокруткой
        const tableContainer = container.createDiv({
            cls: "fsrs-history-table-container",
        });

        // Создаем таблицу
        const table = tableContainer.createEl("table", {
            cls: "fsrs-history-table",
        });

        // Заголовок таблицы
        const thead = table.createEl("thead");
        const headerRow = thead.insertRow();
        headerRow.insertCell().textContent = i18n.t("history.table.number");
        headerRow.insertCell().textContent = i18n.t("history.table.datetime");
        headerRow.insertCell().textContent = i18n.t("history.table.rating");
        headerRow.insertCell().textContent = i18n.t("history.table.stability");
        headerRow.insertCell().textContent = i18n.t("history.table.difficulty");
        headerRow.insertCell().textContent = i18n.t(
            "history.table.days_since_last",
        );
        headerRow.insertCell().textContent = i18n.t("history.table.actions");

        // Тело таблицы
        const tbody = table.createEl("tbody");

        // Сортируем повторения по дате (сначала самые новые)
        const sortedReviews = [...this.card.reviews].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        // Заполняем таблицу данными
        for (let i = 0; i < sortedReviews.length; i++) {
            const review = sortedReviews[i]!;
            const row = tbody.insertRow();

            // Номер повторения (обратный порядок)
            row.insertCell().textContent = (
                sortedReviews.length - i
            ).toString();

            // Дата и время
            const dateCell = row.insertCell();
            try {
                const date = new Date(review.date);
                dateCell.textContent = formatLocalDate(date, this.app);
            } catch {
                dateCell.textContent = review.date;
            }

            // Оценка с переводом
            const ratingCell = row.insertCell();
            ratingCell.textContent = this.translateRating(review.rating);

            // Стабильность (округленная)
            const stabilityCell = row.insertCell();
            stabilityCell.textContent = review.stability.toFixed(1);

            // Сложность (округленная)
            const difficultyCell = row.insertCell();
            difficultyCell.textContent = review.difficulty.toFixed(1);

            // Интервал в днях с предыдущего повторения
            const intervalCell = row.insertCell();
            if (i < sortedReviews.length - 1) {
                const prevReview = sortedReviews[i + 1]!;
                const currentDate = new Date(review.date);
                const prevDate = new Date(prevReview.date);
                const intervalDays = Math.round(
                    (currentDate.getTime() - prevDate.getTime()) /
                        (1000 * 60 * 60 * 24),
                );
                intervalCell.textContent = intervalDays.toString();
            } else {
                intervalCell.textContent = "-";
            }

            // Кнопка удаления — только для последнего повторения (первая строка)
            const actionsCell = row.insertCell();
            if (i === 0) {
                const deleteBtn = actionsCell.createEl("button", {
                    cls: "fsrs-history-delete-btn",
                    text: "✕",
                });
                deleteBtn.setAttribute(
                    "aria-label",
                    i18n.t("history.delete_aria"),
                );
                // Блокируем кнопку, если ещё не прошло 3 секунды после удаления
                const now = Date.now();
                if (now < this.deleteCooldownUntil) {
                    deleteBtn.disabled = true;
                    const remaining = this.deleteCooldownUntil - now;
                    setTimeout(() => {
                        this.onOpen();
                    }, remaining);
                }

                deleteBtn.addEventListener("click", () => {
                    deleteBtn.disabled = true;

                    void deleteLastReview(
                        this.app,
                        this.plugin,
                        this.filePath,
                    ).then((success) => {
                        if (success) {
                            this.deleteCooldownUntil = Date.now() + 3000;
                            // Перезагружаем данные и обновляем содержимое модального окна
                            void this.loadCardData().then(() => {
                                this.onOpen();
                            });
                        } else {
                            // При ошибке разблокируем кнопку
                            deleteBtn.disabled = false;
                        }
                    });
                });
            } else {
                actionsCell.textContent = "";
            }
        }
    }

    /**
     * Рендерит статистику по истории повторений
     */
    private renderStatistics(container: HTMLElement): void {
        if (!this.card) return;

        const statsContainer = container.createDiv({
            cls: "fsrs-history-statistics",
        });

        statsContainer.createEl("h3", {
            text: i18n.t("history.statistics.heading"),
        });

        const statsList = statsContainer.createEl("ul", {
            cls: "fsrs-history-stats-list",
        });

        // Общее количество повторений
        const totalItem = statsList.createEl("li");
        totalItem.textContent = i18n.t("history.statistics.total_reviews", {
            count: this.card.reviews.length,
        });

        // Первое повторение
        if (this.card.reviews.length > 0) {
            const firstReview = this.card.reviews.reduce((earliest, current) =>
                new Date(current.date) < new Date(earliest.date)
                    ? current
                    : earliest,
            );

            const firstItem = statsList.createEl("li");
            try {
                const date = new Date(firstReview.date);
                firstItem.textContent = i18n.t(
                    "history.statistics.first_review",
                    { date: formatLocalDate(date, this.app) },
                );
            } catch {
                firstItem.textContent = i18n.t(
                    "history.statistics.first_review",
                    { date: firstReview.date },
                );
            }
        }

        // Последнее повторение
        if (this.card.reviews.length > 0) {
            const lastReview = this.card.reviews.reduce((latest, current) =>
                new Date(current.date) > new Date(latest.date)
                    ? current
                    : latest,
            );

            const lastItem = statsList.createEl("li");
            try {
                const date = new Date(lastReview.date);
                lastItem.textContent = i18n.t(
                    "history.statistics.last_review",
                    { date: formatLocalDate(date, this.app) },
                );
            } catch {
                lastItem.textContent = i18n.t(
                    "history.statistics.last_review",
                    { date: lastReview.date },
                );
            }

            // Оценка последнего повторения
            const lastRatingItem = statsList.createEl("li");
            lastRatingItem.textContent = i18n.t(
                "history.statistics.last_rating",
                {
                    rating: this.translateRating(lastReview.rating),
                },
            );
        }

        // Распределение оценок
        if (this.card.reviews.length > 0) {
            const ratingCounts = {
                Again: 0,
                Hard: 0,
                Good: 0,
                Easy: 0,
            };

            for (const review of this.card.reviews) {
                ratingCounts[review.rating]++;
            }

            const ratingsItem = statsList.createEl("li");
            ratingsItem.textContent = i18n.t(
                "history.statistics.ratings_distribution",
                {
                    again: ratingCounts.Again,
                    hard: ratingCounts.Hard,
                    good: ratingCounts.Good,
                    easy: ratingCounts.Easy,
                },
            );
        }
    }

    /**
     * Возвращает название оценки с цветным индикатором
     * Берёт строку из review.buttons.*, отрезает номер клавиши "(N)"
     */
    private translateRating(rating: FSRSRating): string {
        const emojiMap: Record<FSRSRating, string> = {
            Again: "\u{1F7E5}",
            Hard: "\u{1F7E8}",
            Good: "\u{1F7E9}",
            Easy: "\u{1F7E6}",
        };
        const key = rating.toLowerCase() as "again" | "hard" | "good" | "easy";
        const label = i18n.t(`review.buttons.${key}`).replace(/ \(\d\)$/, "");
        return `${emojiMap[rating]} ${label}`;
    }

    /**
     * Вызывается при закрытии модального окна
     */
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Показывает историю повторений для текущей карточки
 */
export async function showReviewHistoryForCurrentFile(
    plugin: MyPlugin,
): Promise<void> {
    try {
        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        const modal = new ReviewHistoryModal(
            plugin.app,
            plugin,
            activeFile.path,
        );
        await modal.show();
    } catch (error) {
        console.error("Ошибка при открытии истории повторений:", error);
        showNotice("notices.review_history_error");
    }
}
