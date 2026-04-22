import { Modal, App } from "obsidian";
import type { ModernFSRSCard, FSRSRating } from "../../interfaces/fsrs";
import { i18n } from "../../utils/i18n";

/**
 * Модальное окно для выбора оценки при повторении карточки
 * Использует стандартный API Obsidian Modal
 */
export class ReviewModal extends Modal {
    private card: ModernFSRSCard;
    private resolve: (rating: FSRSRating | null) => void;
    private ratingSelected: boolean = false;

    constructor(app: App, card: ModernFSRSCard) {
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
        const info = contentEl.createEl("div");
        const small = info.createEl("small");

        // Файл
        small.createEl("strong", { text: i18n.t("review.file_label") });
        small.appendText(" " + this.card.filePath);
        small.createEl("br");

        // Сессии
        small.createEl("strong", { text: i18n.t("review.sessions_label") });
        small.appendText(" " + this.card.reviews.length);
        small.createEl("br");

        // Последняя
        small.createEl("strong", { text: i18n.t("review.last_review_label") });
        const lastReviewStr =
            this.card.reviews.length > 0
                ? new Date(
                      this.card.reviews[this.card.reviews.length - 1]!.date,
                  ).toLocaleString()
                : i18n.t("review.no_reviews");
        small.appendText(" " + lastReviewStr);
        small.createEl("hr");

        // Кнопки оценок
        const ratings: {
            rating: FSRSRating;
            label: string;
            color: string;
        }[] = [
            {
                rating: "Again",
                label: i18n.t("review.buttons.again"),
                color: "var(--color-red)",
            },
            {
                rating: "Hard",
                label: i18n.t("review.buttons.hard"),
                color: "var(--color-orange)",
            },
            {
                rating: "Good",
                label: i18n.t("review.buttons.good"),
                color: "var(--color-green)",
            },
            {
                rating: "Easy",
                label: i18n.t("review.buttons.easy"),
                color: "var(--color-blue)",
            },
        ];

        const buttonContainer = contentEl.createEl("div");
        buttonContainer.style.display = "flex"; // eslint-disable-line obsidianmd/no-static-styles-assignment
        buttonContainer.style.gap = "10px"; // eslint-disable-line obsidianmd/no-static-styles-assignment
        buttonContainer.style.flexWrap = "wrap"; // eslint-disable-line obsidianmd/no-static-styles-assignment
        buttonContainer.style.justifyContent = "center"; // eslint-disable-line obsidianmd/no-static-styles-assignment

        ratings.forEach(({ rating, label, color }) => {
            const button = document.createElement("button");
            button.textContent = label;
            button.style.cssText = `
				flex: 1;
				min-width: 120px;
				padding: 10px 15px;
				background: ${color};
				color: white;
				border: none;
				border-radius: 4px;
				cursor: pointer;
				font-weight: bold;
				transition: opacity 0.2s;
			`;

            button.onmouseenter = () => (button.style.opacity = "0.8"); // eslint-disable-line obsidianmd/no-static-styles-assignment
            button.onmouseleave = () => (button.style.opacity = "1"); // eslint-disable-line obsidianmd/no-static-styles-assignment

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
