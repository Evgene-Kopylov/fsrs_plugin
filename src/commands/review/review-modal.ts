import { Modal, App } from "obsidian";
import type { CardData, FSRSRating } from "../../interfaces/fsrs";
import { numberToRating } from "../../interfaces/fsrs";
import { i18n } from "../../utils/i18n";

/** Интервалы в днях для каждой оценки */
export interface NextReviewIntervals {
    again: number | null;
    hard: number | null;
    good: number | null;
    easy: number | null;
}

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
        private nextIntervals?: NextReviewIntervals,
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

        // Заголовок — имя файла
        const fileName = this.card.filePath
            .split("/")
            .pop()!
            .replace(/\.md$/, "");
        contentEl.createEl("h3", { text: fileName });

        // Плиточки повторений (как в поле reviews)
        if (this.card.reviews.length > 0) {
            const pillsRow = contentEl.createDiv({
                cls: "fsrs-review-pills",
            });
            for (const rev of this.card.reviews) {
                const key = numberToRating(rev.rating);
                const color =
                    this.customColors?.[key]?.trim() ||
                    `var(--fsrs-color-${key})`;
                const label =
                    this.customLabels?.[key]?.trim() ||
                    i18n.t(`review.buttons.${key}`).replace(/ \(\d\)$/, "");

                const pill = pillsRow.createDiv({
                    cls: "fsrs-review-pill",
                });
                pill.style.backgroundColor = color;

                const tip = pill.createDiv({ cls: "fsrs-review-pill-tip" });
                tip.createSpan({ text: rev.date.substring(0, 10) });
                tip.createSpan({ text: " " });
                tip.createSpan({
                    text: label,
                    cls: `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r${rev.rating}`,
                });
            }
        }

        // Список интервалов
        let intervalRows: Record<string, HTMLElement> = {};
        if (this.nextIntervals) {
            const list = contentEl.createDiv({
                cls: "fsrs-interval-list",
            });
            const ratings: FSRSRating[] = ["again", "hard", "good", "easy"];
            for (const r of ratings) {
                const days = this.nextIntervals[r];
                if (days == null) continue;
                const row = list.createDiv({
                    cls: "fsrs-interval-row",
                });
                row.setAttr("data-rating", r);

                const labelClean =
                    this.customLabels?.[r]?.trim() ||
                    i18n.t(`review.buttons.${r}`).replace(/ \(\d\)$/, "");

                row.createSpan({
                    text: labelClean,
                    cls: "fsrs-interval-label",
                });

                const daysSpan = row.createSpan({
                    cls: "fsrs-interval-days",
                });
                daysSpan.createSpan({
                    cls: "fsrs-interval-marker",
                    text: "-> ",
                });
                daysSpan.createSpan({
                    text: `${days} ${i18n.t("review.interval_days_unit")}`,
                });

                intervalRows[r] = row;
            }
        }

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
                rating: "again",
                label: labelOrTranslation("again"),
                color: colorOrDefault("again"),
            },
            {
                rating: "hard",
                label: labelOrTranslation("hard"),
                color: colorOrDefault("hard"),
            },
            {
                rating: "good",
                label: labelOrTranslation("good"),
                color: colorOrDefault("good"),
            },
            {
                rating: "easy",
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

            // Подсветка строки интервала при наведении
            const intervalRow = intervalRows[rating];
            if (intervalRow) {
                button.onmouseenter = () =>
                    intervalRow.addClass("fsrs-interval-row-active");
                button.onmouseleave = () =>
                    intervalRow.removeClass("fsrs-interval-row-active");
            }

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
