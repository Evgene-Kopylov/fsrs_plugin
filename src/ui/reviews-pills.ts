/**
 * Цветные плиточки для поля reviews во фронтматтере.
 * Находит .metadata-property[data-property-key="reviews"] в DOM,
 * скрывает сырое значение и показывает плиточки с тултипами.
 */

import type FsrsPlugin from "../main";
import { numberToRating } from "../interfaces/fsrs";
import { i18n } from "../utils/i18n";

export class ReviewsPills {
    private property: HTMLElement | null = null;

    constructor(
        private plugin: FsrsPlugin,
        private containerEl: HTMLElement,
    ) {}

    /** Найти свойство reviews в DOM и отрисовать плиточки */
    render(reviews: Array<{ date: string; rating: number }>): void {
        const prop = this.findProperty();

        if (!prop || reviews.length === 0) {
            this.destroy();
            return;
        }

        if (this.property === prop) {
            const existing = prop.querySelector(".fsrs-reviews-pills");
            if (existing) existing.remove();
        } else if (prop.querySelector(".fsrs-reviews-pills")) {
            this.destroy();
            this.property = prop;
            return;
        } else {
            this.destroy();
        }
        this.property = prop;

        const pills = createDiv({ cls: "fsrs-reviews-pills" });

        for (const r of reviews) {
            const key = numberToRating(r.rating);
            const customColor = this.plugin.settings.customButtonColors?.[key];
            const color =
                customColor && customColor.trim() !== ""
                    ? customColor
                    : `var(--fsrs-color-${key})`;
            const customLabel = this.plugin.settings.customButtonLabels?.[key];
            const label =
                customLabel && customLabel.trim() !== ""
                    ? customLabel
                    : i18n.t(`review.buttons.${key}`).replace(/ \(\d\)$/, "");

            const pill = pills.createDiv({ cls: "fsrs-reviews-pill" });
            pill.style.backgroundColor = color;

            const tip = pill.createDiv({ cls: "fsrs-reviews-pill-tip" });
            const d = window.moment(r.date);
            tip.createSpan({
                text: d.isValid() ? d.format("YYYY-MM-DD") : r.date,
            });
            tip.createSpan({ text: " " });
            tip.createSpan({
                text: label,
                cls: `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r${r.rating}`,
            });
        }

        prop.classList.add("fsrs-reviews-styled");
        prop.appendChild(pills);

        // overflow: visible на контейнере метаданных (без :has)
        const container = prop.closest(".metadata-container");
        if (container) container.classList.add("fsrs-reviews-active");
    }

    /** Убрать плиточки и вернуть видимость сырому значению */
    destroy(): void {
        if (this.property) {
            this.property.classList.remove("fsrs-reviews-styled");
            const container = this.property.closest(".metadata-container");
            if (container) container.classList.remove("fsrs-reviews-active");
            const pills = this.property.querySelector(".fsrs-reviews-pills");
            if (pills) pills.remove();
            this.property = null;
        }
    }

    /** Найти свойство reviews в DOM через ближайший контейнер вьюхи */
    private findProperty(): HTMLElement | null {
        const view = this.containerEl.closest<HTMLElement>(
            ".markdown-reading-view, .cm-scroller",
        );
        if (!view) return null;
        return view.querySelector<HTMLElement>(
            '.metadata-property[data-property-key="reviews"]',
        );
    }
}
