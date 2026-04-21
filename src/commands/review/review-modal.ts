import { Modal, App } from "obsidian";
import type { ModernFSRSCard, FSRSRating } from "../../interfaces/fsrs";

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
        contentEl.createEl("h3", { text: "Повторение карточки" });

        // Информация о карточке
        const info = contentEl.createEl("div");
        const small = info.createEl("small");
        const fileLine = small.createEl("span");
        fileLine.createEl("strong", { text: "Файл: " });
        fileLine.appendText(this.card.filePath);
        small.createEl("br");
        const sessionsLine = small.createEl("span");
        sessionsLine.createEl("strong", { text: "Сессий: " });
        sessionsLine.appendText(String(this.card.reviews.length));
        small.createEl("br");
        const lastLine = small.createEl("span");
        lastLine.createEl("strong", { text: "Последняя: " });
        lastLine.appendText(
            this.card.reviews.length > 0
                ? new Date(
                      this.card.reviews[this.card.reviews.length - 1]!.date,
                  ).toLocaleString()
                : "нет",
        );
        info.createEl("hr");

        // Кнопки оценок
        const ratings: {
            rating: FSRSRating;
            label: string;
            color: string;
        }[] = [
            {
                rating: "Again",
                label: "Again (1)",
                color: "var(--color-red)",
            },
            {
                rating: "Hard",
                label: "Hard (2)",
                color: "var(--color-orange)",
            },
            {
                rating: "Good",
                label: "Good (3)",
                color: "var(--color-green)",
            },
            {
                rating: "Easy",
                label: "Easy (4)",
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
        const cancelButton = contentEl.createEl("button", { text: "Отмена" });
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
