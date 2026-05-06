import { Modal, App } from "obsidian";
import type { CardData, FSRSRating } from "../../interfaces/fsrs";
import { i18n } from "../../utils/i18n";

/**
 * Модальное окно для выбора оценки при повторении карточки
 * Использует стандартный API Obsidian Modal
 */
export class ReviewModal extends Modal {
    private card: CardData;
    private resolve: (rating: FSRSRating | null) => void;
    private ratingSelected: boolean = false;

    constructor(
        app: App,
        card: CardData,
        private customLabels?: {
            again: string;
            hard: string;
            good: string;
            easy: string;
        },
        private customColors?: {
            again: string;
            hard: string;
            good: string;
            easy: string;
        },
    ) {
        super(app);
        this.card = card;
    }

    /**
     * Показывает модальное окно и возвращает выбранную оценку или null при отмене
     */
    async show(): Promise<FSRSRating | null> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    /**
     * Вызывается при открытии модального окна
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Заголовок
        contentEl.createEl("h3", { text: i18n.t("review.title") });

        // Информация о карточке
        const info = contentEl.createDiv({
            cls: "fsrs-review-info",
        });
        const small = info.createEl("small");

        // Файл
        small.createEl("strong", { text: i18n.t("review.file_label") });
        small.appendText(" " + this.card.filePath);
        small.createEl("br");

        // Сессии
        small.createEl("strong", { text: i18n.t("review.sessions_label") });
        small.appendText(" " + this.card.reviews.length);
        small.createEl("br");

        // Последняя + оценка (одна строка)
        small.createEl("strong", { text: i18n.t("review.last_review_label") });
        if (this.card.reviews.length > 0) {
            const last = this.card.reviews[this.card.reviews.length - 1]!;
            small.appendText(" " + new Date(last.date).toLocaleString());
            const ratingLabels = ["Again", "Hard", "Good", "Easy"];
            const ratingLabel = ratingLabels[last.rating] ?? "?";
            small.appendText(" ");
            small.createEl("span", {
                text: ratingLabel,
                cls: `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r${last.rating}`,
            });
        } else {
            small.appendText(" " + i18n.t("review.no_reviews"));
        }
        small.createEl("hr");

        // Вспомогательная функция: custom label или перевод
        const labelOrTranslation = (
            key: "again" | "hard" | "good" | "easy",
        ): string => {
            const custom = this.customLabels?.[key];
            return custom && custom.trim() !== ""
                ? custom
                : i18n.t(`review.buttons.${key}`);
        };

        // Вспомогательная функция: custom цвет или CSS-переменная
        const colorOrDefault = (
            key: "again" | "hard" | "good" | "easy",
        ): string => {
            const custom = this.customColors?.[key];
            if (custom && custom.trim() !== "") {
                return custom;
            }
            return `var(--fsrs-color-${key})`;
        };

        // Кнопки оценок
        const ratings: {
            rating: FSRSRating;
            label: string;
            color: string;
        }[] = [
            {
                rating: "Again",
                label: labelOrTranslation("again"),
                color: colorOrDefault("again"),
            },
            {
                rating: "Hard",
                label: labelOrTranslation("hard"),
                color: colorOrDefault("hard"),
            },
            {
                rating: "Good",
                label: labelOrTranslation("good"),
                color: colorOrDefault("good"),
            },
            {
                rating: "Easy",
                label: labelOrTranslation("easy"),
                color: colorOrDefault("easy"),
            },
        ];

        const buttonContainer = contentEl.createDiv({
            cls: "fsrs-rating-container",
        });

        ratings.forEach(({ rating, label, color }) => {
            const button = createEl("button");
            button.className = "fsrs-rating-button";
            button.textContent = label;
            button.style.backgroundColor = color;

            button.onclick = () => {
                this.ratingSelected = true;
                this.resolve(rating);
                this.close();
            };

            buttonContainer.appendChild(button);
        });

        // Кнопка отмены
        const cancelButton = contentEl.createEl("button", {
            text: i18n.t("review.buttons.cancel"),
        });
        cancelButton.style.cssText = `
			margin-top: 15px;
			width: 100%;
			padding: 8px;
			background: var(--background-modifier-border);
			color: var(--text-normal);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		`;

        cancelButton.onclick = () => {
            this.resolve(null);
            this.close();
        };
    }

    /**
     * Вызывается при закрытии модального окна
     */
    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Если окно закрыто без выбора оценки (например, нажатием Esc)
        if (!this.ratingSelected) {
            this.resolve(null);
        }
    }
}
