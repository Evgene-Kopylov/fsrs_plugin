/**
 * Рендерер блока fsrs-heatmap.
 *
 * НЕ содержит логики. Все вычисления и строки — в Rust (get_heatmap_data).
 * TS только создаёт DOM-элементы и вставляет готовые значения из JSON.
 */

import { MarkdownRenderChild } from "obsidian";
import type FsrsPlugin from "../main";
import type { HeatmapData } from "../utils/fsrs/fsrs-cache";
import { i18n } from "../utils/i18n";
import { verboseLog } from "../utils/logger";

// ---------------------------------------------------------------------------
// Константы отрисовки (только вёрстка)
// ---------------------------------------------------------------------------

const DEFAULT_WEEKS = 53;

const RATING_LABELS: Record<number, string> = {
    0: "Again",
    1: "Hard",
    2: "Good",
    3: "Easy",
};

// ---------------------------------------------------------------------------
// FsrsHeatmapRenderer
// ---------------------------------------------------------------------------

export class FsrsHeatmapRenderer extends MarkdownRenderChild {
    private isRendering = false;
    private popupEl: HTMLElement | null = null;
    private locked = false;
    private currentAnchor: HTMLElement | null = null;

    constructor(
        private plugin: FsrsPlugin,
        private container: HTMLElement,
        _source: string,
    ) {
        super(container);
    }

    onload(): void {
        super.onload();
        this.showLoading();
        this.plugin.registerFsrsTableRenderer(this);
        void this.refresh();
    }

    onunload() {
        this.plugin.unregisterFsrsTableRenderer(this);
        this.closePopup();
        super.onunload();
    }

    async refresh(): Promise<void> {
        if (!this.plugin.isWasmReady()) {
            this.plugin.onWasmReady(() => void this.refresh());
            return;
        }
        await this.plugin.ensureCacheScanned();
        await this.renderContent();
    }

    // -------------------------------------------------------------------
    // Рендеринг (только DOM из готовых данных)
    // -------------------------------------------------------------------

    private async renderContent() {
        if (this.isRendering) return;
        this.isRendering = true;
        const t0 = performance.now();

        try {
            if (!this.plugin.isWasmReady()) {
                this.showLoading();
                return;
            }
            await this.plugin.ensureCacheScanned();

            const data = this.plugin.cache.getHeatmapData(
                new Date(),
                DEFAULT_WEEKS,
                i18n.getLocale(),
            );

            if (data.error) {
                this.renderError(data.error);
                return;
            }

            this.container.empty();
            this.renderGrid(data);
            // Скролл к правому краю — последние обновления на виду
            const block = this.container.closest<HTMLElement>(
                ".block-language-fsrs-heatmap",
            );
            if (block) block.scrollLeft = block.scrollWidth;
        } catch (e) {
            this.renderError(String(e));
        } finally {
            verboseLog(
                `⏱️ Heatmap: ${((performance.now() - t0) / 1000).toFixed(2)} с`,
            );
            this.isRendering = false;
        }
    }

    /** Создаёт всю DOM-сетку из готовых данных */
    private renderGrid(d: HeatmapData) {
        const wrap = this.container.createDiv({ cls: "fsrs-heatmap-wrapper" });

        // Заголовок
        wrap.createDiv({ cls: "fsrs-heatmap-header", text: d.title });

        const grid = wrap.createDiv({ cls: "fsrs-heatmap-grid" });

        // Строка месяцев: 28px spacer + 53 недели × 15px
        const monthRow = grid.createDiv({ cls: "fsrs-heatmap-months" });
        monthRow.createDiv({ cls: "fsrs-heatmap-month-spacer" });

        // Карта: неделя → название месяца
        const monthMap = new Map<number, string>();
        for (const mp of d.month_positions) {
            monthMap.set(mp.week, d.month_names[mp.month] ?? "");
        }

        for (let w = 0; w < d.weeks; w++) {
            const lbl = monthRow.createDiv({ cls: "fsrs-heatmap-month-label" });
            lbl.setText(monthMap.get(w) ?? "");
        }

        // Тело: дни недели + ячейки
        const body = grid.createDiv({ cls: "fsrs-heatmap-body" });

        // Колонка дней недели
        const dayCol = body.createDiv({ cls: "fsrs-heatmap-days" });
        for (const label of d.day_labels) {
            const dl = dayCol.createDiv({ cls: "fsrs-heatmap-day-label" });
            if (label) dl.setText(label);
        }

        // Ячейки
        const cells = body.createDiv({ cls: "fsrs-heatmap-cells" });
        for (let w = 0; w < d.weeks; w++) {
            const weekCol = cells.createDiv({ cls: "fsrs-heatmap-week" });
            for (let day = 0; day < 7; day++) {
                const idx = w * 7 + day;
                const cell = d.cells[idx];
                if (!cell) continue;

                const cls = [
                    "fsrs-heatmap-cell",
                    `fsrs-heatmap-level-${cell.level}`,
                ];
                if (cell.border_top) cls.push("fsrs-heatmap-bt");
                if (cell.border_bottom) cls.push("fsrs-heatmap-bb");
                if (cell.border_left) cls.push("fsrs-heatmap-bl");
                if (cell.border_right) cls.push("fsrs-heatmap-br");
                if (cell.future) cls.push("fsrs-heatmap-future");

                const el = weekCol.createDiv({ cls: cls.join(" ") });

                el.addEventListener("mouseenter", () =>
                    this.showPopup(el, cell.date, cell.tooltip, cell.reviews),
                );
                el.addEventListener("mouseleave", () => {
                    if (!this.locked) this.closePopup();
                });
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.lockPopup(el, cell.date, cell.tooltip, cell.reviews);
                });
            }
        }
    }

    // -------------------------------------------------------------------
    // Попап (ховер — быстро, клик — фиксация + ссылки)
    // -------------------------------------------------------------------

    private showPopup(
        anchor: HTMLElement,
        date: string,
        countLabel: string,
        reviews: Array<{ file: string; path: string; rating: number }>,
    ) {
        if (this.locked) return;

        this.closePopup();
        this.currentAnchor = anchor;
        this.popupEl = this.buildPopup(
            anchor,
            date,
            countLabel,
            reviews,
            false,
        );
    }

    private lockPopup(
        anchor: HTMLElement,
        date: string,
        countLabel: string,
        reviews: Array<{ file: string; path: string; rating: number }>,
    ) {
        if (this.locked && this.currentAnchor === anchor) {
            this.closePopup();
            return;
        }

        this.closePopup();
        this.locked = true;
        this.currentAnchor = anchor;
        const popup = this.buildPopup(anchor, date, countLabel, reviews, true);
        this.popupEl = popup;

        // Клик вне попапа — закрыть
        const close = (e: MouseEvent) => {
            if (!popup.contains(e.target as Node) && e.target !== anchor) {
                this.closePopup();
                // eslint-disable-next-line obsidianmd/prefer-active-doc -- activeDocument не экспортирован в Obsidian 1.12.3
                document.removeEventListener("click", close);
            }
        };
        // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- activeWindow не экспортирован
        setTimeout(
            // eslint-disable-next-line obsidianmd/prefer-active-doc -- activeDocument не экспортирован
            () => document.addEventListener("click", close),
            0,
        );
    }

    private buildPopup(
        anchor: HTMLElement,
        date: string,
        countLabel: string,
        reviews: Array<{ file: string; path: string; rating: number }>,
        asLinks: boolean,
    ): HTMLElement {
        const popup = createDiv({ cls: "fsrs-heatmap-popup" });

        // Дата через Obsidian moment
        const d = window.moment(date);
        const header = d.isValid()
            ? `${d.format("LL")}: ${countLabel}`
            : `${date}: ${countLabel}`;
        popup.createDiv({ cls: "fsrs-heatmap-tip-header", text: header });

        for (const r of reviews) {
            const row = popup.createDiv({ cls: "fsrs-heatmap-tip-row" });
            if (asLinks) {
                const link = row.createEl("a", {
                    cls: "internal-link fsrs-heatmap-tip-file",
                    href: r.path,
                    text: r.file,
                });
                link.setAttr("data-href", r.path);
                link.addEventListener("mouseenter", (e) => {
                    this.plugin.app.workspace.trigger("hover-link", {
                        event: e,
                        source: "preview",
                        hoverParent: popup,
                        targetEl: link,
                        linktext: r.path,
                    });
                });
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    const file = this.plugin.app.vault.getFileByPath(r.path);
                    if (file) {
                        void this.plugin.app.workspace
                            .getLeaf(false)
                            .openFile(file);
                    }
                });
            } else {
                row.createSpan({ cls: "fsrs-heatmap-tip-file", text: r.file });
            }
            row.createSpan({
                text: RATING_LABELS[r.rating] ?? "?",
                cls: `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r${r.rating}`,
            });
        }

        // eslint-disable-next-line obsidianmd/prefer-active-doc -- activeDocument не экспортирован
        document.body.appendChild(popup);

        const ar = anchor.getBoundingClientRect();
        const pr = popup.getBoundingClientRect();
        popup.setCssProps({
            top: `${Math.max(4, ar.top - pr.height - 6)}px`,
            left: `${Math.max(4, ar.left + ar.width / 2 - pr.width / 2)}px`,
        });

        return popup;
    }

    private closePopup() {
        if (this.popupEl) {
            this.popupEl.remove();
            this.popupEl = null;
        }
        this.locked = false;
        this.currentAnchor = null;
    }

    // -------------------------------------------------------------------
    // Состояния
    // -------------------------------------------------------------------

    private showLoading() {
        this.container.empty();
        this.container
            .createDiv({ cls: "fsrs-heatmap-loading" })
            .createEl("small", {
                text: i18n.t("table.loading"),
            });
    }

    private renderError(msg: string) {
        this.container.empty();
        this.container.addClass("fsrs-heatmap-error");
        this.container.createEl("pre", {
            text: msg,
            cls: "fsrs-heatmap-error-text",
        });
    }
}
