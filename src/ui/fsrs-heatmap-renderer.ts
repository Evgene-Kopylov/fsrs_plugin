/**
 * Рендерер блока fsrs-heatmap.
 *
 * НЕ содержит логики. Все вычисления и строки — в Rust (get_heatmap_data).
 * TS только создаёт DOM-элементы и вставляет готовые значения из JSON.
 */

import { MarkdownRenderChild } from "obsidian";
import type FsrsPlugin from "../main";
import { OBSIDIAN_ACCENT_VAR } from "../constants";
import type { HeatmapData, HeatmapReviews } from "../utils/fsrs/fsrs-cache";
import { i18n } from "../utils/i18n";
import { verboseLog } from "../utils/logger";

// Глобальные переменные Obsidian для popout window совместимости
declare const activeWindow: Window & { setTimeout: Window["setTimeout"] };
declare const activeDocument: Document;

// ---------------------------------------------------------------------------
// Константы отрисовки (только вёрстка)
// ---------------------------------------------------------------------------

const DEFAULT_WEEKS = 53;

// ---------------------------------------------------------------------------
// FsrsHeatmapRenderer
// ---------------------------------------------------------------------------

export class FsrsHeatmapRenderer extends MarkdownRenderChild {
    private isRendering = false;
    private popupEl: HTMLElement | null = null;
    private locked = false;
    private currentAnchor: HTMLElement | null = null;
    private reviewsCache: HeatmapReviews | null = null;

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
        this.reviewsCache = null;
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
            if (block) {
                block.scrollLeft = block.scrollWidth;
                new ResizeObserver(() => {
                    block.scrollLeft = block.scrollWidth;
                }).observe(block);
            }
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

                const cls = ["fsrs-heatmap-cell"];
                if (cell.border_top) cls.push("fsrs-heatmap-bt");
                if (cell.border_bottom) cls.push("fsrs-heatmap-bb");
                if (cell.border_left) cls.push("fsrs-heatmap-bl");
                if (cell.border_right) cls.push("fsrs-heatmap-br");
                if (cell.future) cls.push("fsrs-heatmap-future");

                const el = weekCol.createDiv({ cls: cls.join(" ") });
                if (cell.level > 0) {
                    const target = this.plugin.settings.heatmap_target_count;
                    const ratio = cell.count / target;
                    const cellStyle: Record<string, string> = {
                        backgroundColor:
                            this.plugin.settings.heatmap_color ||
                            OBSIDIAN_ACCENT_VAR,
                    };
                    if (ratio <= 1) {
                        cellStyle.opacity = String(ratio);
                    } else {
                        cellStyle.opacity = "1";
                        cellStyle.filter = `brightness(${1 + (ratio - 1)})`;
                    }
                    Object.assign(el.style, cellStyle);
                }

                if (cell.count > 0) {
                    el.addEventListener("mouseenter", () => {
                        const reviews = this.ensureReviews()[cell.date] ?? [];
                        this.showPopup(el, cell.date, cell.tooltip, reviews);
                    });
                    el.addEventListener("mouseleave", () => {
                        if (!this.locked) this.closePopup();
                    });
                    el.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const reviews = this.ensureReviews()[cell.date] ?? [];
                        this.lockPopup(el, cell.date, cell.tooltip, reviews);
                    });
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Попап (ховер — быстро, клик — фиксация + ссылки)
    // -------------------------------------------------------------------

    /** Ленивая загрузка reviews: первый вызов ходит в WASM, дальше из кэша */
    private ensureReviews(): HeatmapReviews {
        if (!this.reviewsCache) {
            this.reviewsCache = this.plugin.cache.getHeatmapReviews(
                new Date(),
                DEFAULT_WEEKS,
            );
        }
        return this.reviewsCache;
    }

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
                activeDocument.removeEventListener("click", close);
            }
        };
        activeWindow.setTimeout(
            () => activeDocument.addEventListener("click", close),
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
            const ratingKey =
                ["again", "hard", "good", "easy"][r.rating] ?? "good";
            row.createSpan({
                text: i18n
                    .t(`review.buttons.${ratingKey}`)
                    .replace(/ \(\d\)$/, ""),
                cls: `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r${r.rating}`,
            });
        }

        activeDocument.body.appendChild(popup);

        const ar = anchor.getBoundingClientRect();
        const pr = popup.getBoundingClientRect();
        // Если не помещается сверху — показываем снизу
        const topAbove = ar.top - pr.height - 6;
        const top = topAbove >= 4 ? topAbove : ar.bottom + 6;
        const left = Math.min(
            Math.max(4, ar.left + ar.width / 2 - pr.width / 2),
            window.innerWidth - pr.width - 4,
        );
        popup.setCssProps({
            top: `${top}px`,
            left: `${left}px`,
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
