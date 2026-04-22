import { Modal, App } from "obsidian";
import { showNotice } from "../utils/notice";
import {
    parseModernFsrsFromFrontmatter,
    extractFrontmatter,
    formatLocalDate,
} from "../utils/fsrs-helper";
import type { ModernFSRSCard, FSRSRating } from "../interfaces/fsrs";

/**
 * Модальное окно для просмотра истории повторений карточки FSRS
 * Отображает таблицу с историей повторений и статистику
 */
export class ReviewHistoryModal extends Modal {
    private card: ModernFSRSCard | null = null;
    private filePath: string;

    /**
     * Создает модальное окно для просмотра истории повторений
     * @param app - Экземпляр приложения Obsidian
     * @param filePath - Путь к файлу карточки
     */
    constructor(app: App, filePath: string) {
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
        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
        modalEl.style.width = "70%";
        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
        modalEl.style.maxWidth = "800px";
        // eslint-disable-next-line obsidianmd/no-static-styles-assignment
        modalEl.style.maxHeight = "80vh";

        contentEl.empty();

        if (!this.card) {
            contentEl.createEl("p", {
                text: "Не удалось загрузить данные карточки",
            });
            return;
        }

        // Заголовок с именем файла
        const fileName = this.filePath.split("/").pop() || this.filePath;
        contentEl.createEl("h2", {
            text: `История повторений: ${fileName}`,
            cls: "fsrs-history-title",
        });

        // Информация о файле
        const fileInfo = contentEl.createEl("div", {
            cls: "fsrs-history-file-info",
        });
        fileInfo.createEl("small", {
            text: `Файл: ${this.filePath}`,
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
            emptyMessage.textContent = "Нет истории повторений";
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
        headerRow.insertCell().textContent = "#";
        headerRow.insertCell().textContent = "Дата и время";
        headerRow.insertCell().textContent = "Оценка";
        headerRow.insertCell().textContent = "Стабильность";
        headerRow.insertCell().textContent = "Сложность";
        headerRow.insertCell().textContent = "Дней с прошлого";

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
            text: "Статистика",
        });

        const statsList = statsContainer.createEl("ul", {
            cls: "fsrs-history-stats-list",
        });

        // Общее количество повторений
        const totalItem = statsList.createEl("li");
        totalItem.textContent = `Всего повторений: ${this.card.reviews.length}`;

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
                firstItem.textContent = `Первое повторение: ${formatLocalDate(
                    date,
                    this.app,
                )}`;
            } catch {
                firstItem.textContent = `Первое повторение: ${firstReview.date}`;
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
                lastItem.textContent = `Последнее повторение: ${formatLocalDate(
                    date,
                    this.app,
                )}`;
            } catch {
                lastItem.textContent = `Последнее повторение: ${lastReview.date}`;
            }

            // Оценка последнего повторения
            const lastRatingItem = statsList.createEl("li");
            lastRatingItem.textContent = `Последняя оценка: ${this.translateRating(
                lastReview.rating,
            )}`;
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
            ratingsItem.textContent = `Оценки: ${ratingCounts.Again}×🟥 ${ratingCounts.Hard}×🟨 ${ratingCounts.Good}×🟩 ${ratingCounts.Easy}×🟦`;
        }
    }

    /**
     * Переводит оценку на русский язык
     */
    private translateRating(rating: FSRSRating): string {
        const translations: Record<FSRSRating, string> = {
            Again: "🟥 Снова",
            Hard: "🟨 Трудно",
            Good: "🟩 Нормально",
            Easy: "🟦 Легко",
        };
        return translations[rating] || rating;
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
export async function showReviewHistoryForCurrentFile(app: App): Promise<void> {
    try {
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        const modal = new ReviewHistoryModal(app, activeFile.path);
        await modal.show();
    } catch (error) {
        console.error("Ошибка при открытии истории повторений:", error);
        showNotice("notices.review_history_error");
    }
}
