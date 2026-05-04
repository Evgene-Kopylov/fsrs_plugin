/**
 * Класс для динамического рендеринга блока fsrs-table.
 *
 * Запрашивает данные напрямую через plugin.cache.query() (WASM-кэш).
 * Не хранит собственный кэш карточек — вся фильтрация, сортировка
 * и ограничение выполняется на стороне Rust.
 */

import { MarkdownRenderChild } from "obsidian";
import type FsrsPlugin from "../main";
import type { TableParams } from "../utils/fsrs-table-params";
import type {
    CachedCard,
    ComputedCardState,
    CardData,
} from "../interfaces/fsrs";
import { generateTableDOM } from "../utils/fsrs-table-helpers";
import { i18n } from "../utils/i18n";
import { verboseLog } from "../utils/logger";
import { DEFAULT_TABLE_DISPLAY_LIMIT } from "../constants";

/**
 * Внутреннее представление карточки для генерации DOM.
 * Дублирует CardWithState, но не требует импорта из fsrs-table-filter.
 */
interface CardForDisplay {
    card: CardData;
    state: ComputedCardState;
    isDue: boolean;
}

export class FsrsTableRenderer extends MarkdownRenderChild {
    private params: TableParams | null = null;
    private isRendering = false;
    private sourceText: string;
    private isFirstRender = true;

    constructor(
        private plugin: FsrsPlugin,
        private container: HTMLElement,
        source: string,
    ) {
        super(container);
        this.params = null;
        this.sourceText = source;
    }

    // -----------------------------------------------------------------------
    // Жизненный цикл
    // -----------------------------------------------------------------------

    onload(): void {
        super.onload();
        this.showLoadingIndicator();
        this.plugin.registerFsrsTableRenderer(this);
        // Запускаем первый рендер (ленивое сканирование запустится внутри)
        this.refresh().catch(console.error);
    }

    onunload() {
        this.plugin.unregisterFsrsTableRenderer(this);
        super.onunload();
    }

    // -----------------------------------------------------------------------
    // Основной рендеринг
    // -----------------------------------------------------------------------

    /**
     * Запрашивает данные через WASM-кэш и генерирует DOM таблицы.
     */
    private async renderContent() {
        if (this.isRendering) return;

        if (!this.plugin.isWasmReady()) {
            this.showLoadingIndicator();
            this.container.classList.add("fsrs-table-loading");
            // Когда WASM будет готов — перезапустим рендер
            this.plugin.onWasmReady(() => {
                this.refresh().catch(console.error);
            });
            this.isRendering = false;
            return;
        }

        // Убеждаемся, что кэш просканирован (запускает сканирование, если ещё не запущено)
        await this.plugin.ensureCacheScanned();

        this.isRendering = true;
        const start = performance.now();

        // ДИАГНОСТИКА: кто вызывает renderContent
        verboseLog(
            "🔄 renderContent вызван:",
            new Error().stack?.split("\n").slice(2, 5).join(" | "),
        );

        try {
            // Кешируем родительский code block один раз, чтобы избежать forced reflow
            // при многократных вызовах closest() после мутаций DOM
            const codeBlockParent = this.getCodeBlockParent();

            // Захватываем позиции старых строк ДО очистки контейнера (для FLIP-анимации)
            const oldRowRects = this.isFirstRender
                ? null
                : this.captureRowPositions();

            // Убираем класс ошибки
            this.container.removeClass("fsrs-table-error");
            if (codeBlockParent)
                codeBlockParent.removeClass("fsrs-table-error");

            // Парсим SQL блок, если ещё не спарсено
            if (!this.params) {
                const { parseSqlBlock } =
                    await import("../utils/fsrs-table-params");
                this.params = parseSqlBlock(this.sourceText);
            }

            const now = new Date();

            verboseLog("📊 FsrsTableRenderer.renderContent:", {
                params: this.params
                    ? (JSON.parse(JSON.stringify(this.params)) as unknown)
                    : null,
                sourceText: this.sourceText,
            });

            // Прямой запрос к WASM-кэшу
            const result = this.plugin.cache.query(this.params, now);

            verboseLog("📊 Результат WASM query:", {
                cards: result.cards.length,
                totalCount: result.total_count,
                errors: result.errors,
            });

            // Диагностика: формируем строку для самоконтроля
            const effectiveLimit =
                this.params.limit > 0
                    ? this.params.limit
                    : DEFAULT_TABLE_DISPLAY_LIMIT;
            const shownCount = Math.min(result.cards.length, effectiveLimit);
            const hiddenCount = result.total_count - shownCount;
            const parts: string[] = [
                `всего ${result.total_count}`,
                `показано ${shownCount}`,
                `скрыто ${hiddenCount}`,
            ];
            if (this.params.where)
                parts.push(`WHERE ${JSON.stringify(this.params.where)}`);
            if (this.params.sort)
                parts.push(
                    `ORDER BY ${this.params.sort.field} ${this.params.sort.direction}`,
                );
            if (this.params.limit > 0) parts.push(`LIMIT ${this.params.limit}`);
            verboseLog(`📊 Выборка: ${parts.join(" | ")}`);

            if (result.cards.length === 0) {
                this.isFirstRender = false;
                this.renderEmptyState(codeBlockParent);
                return;
            }

            // Преобразуем CachedCard[] → CardForDisplay[] (добавляем isDue)
            const cardsWithDue = this.addIsDue(result.cards, now);

            // Генерируем DOM таблицы
            generateTableDOM(
                this.container,
                cardsWithDue,
                result.total_count,
                this.params,
                this.plugin.settings,
                this.plugin.app,
                now,
            );

            // Применяем FLIP-анимацию для строк (перемещение, появление)
            if (oldRowRects) {
                this.applyFlipAnimation(oldRowRects);
            }

            // Добавляем обработчики событий для сортировки
            this.addEventListeners();

            // Первый рендер завершён
            this.isFirstRender = false;

            this.addLoadedClass(codeBlockParent);
        } catch (error) {
            this.renderErrorState(error);
        } finally {
            const elapsedMs = performance.now() - start;
            const elapsedSec = elapsedMs / 1000;
            verboseLog(`⏱️ Загрузка таблицы FSRS: ${elapsedSec.toFixed(2)} с`);
            this.isRendering = false;
        }
    }

    // -----------------------------------------------------------------------
    // Состояния отображения
    // -----------------------------------------------------------------------

    /** Находит родительский code block (предок с классом block-language-fsrs-table) */
    private getCodeBlockParent(): Element | null {
        return this.container.closest(
            ".block-language-fsrs-table, " +
                ".cm-preview-code-block.block-language-fsrs-table, " +
                ".cm-embed-block.block-language-fsrs-table",
        );
    }

    /** Добавляет класс fsrs-table-loaded на родительский code block */
    private addLoadedClass(codeBlockParent?: Element | null) {
        const parent = codeBlockParent ?? this.getCodeBlockParent();
        parent?.addClass("fsrs-table-loaded");
    }

    /** Убирает класс fsrs-table-loaded с родительского code block */
    private removeLoadedClass(codeBlockParent?: Element | null) {
        const parent = codeBlockParent ?? this.getCodeBlockParent();
        parent?.removeClass("fsrs-table-loaded");
    }

    private showLoadingIndicator(codeBlockParent?: Element | null) {
        this.container.empty();
        // Пока загружаемся — убираем «загруженный» стиль, блок выглядит как обычный code block
        this.removeLoadedClass(codeBlockParent);
        const loadingDiv = this.container.createDiv({
            cls: "fsrs-table-loading",
        });
        loadingDiv.createEl("small", {
            text: i18n.t("table.loading"),
        });
    }

    private renderEmptyState(codeBlockParent?: Element | null) {
        this.container.empty();
        // Пустое состояние — тоже загружено, фон code block не нужен
        this.addLoadedClass(codeBlockParent);
        const emptyDiv = this.container.createDiv({ cls: "fsrs-table-empty" });
        emptyDiv.createEl("small", { text: i18n.t("table.no_cards") });
    }

    private renderErrorState(error: unknown) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.debug(
            `⚠️ Ошибка при рендеринге блока fsrs-table: ${errorMessage}`,
        );

        this.container.empty();
        this.container.classList.remove("fsrs-table-loading");
        this.container.addClass("fsrs-table-error");
        const codeBlockParent = this.getCodeBlockParent();
        if (codeBlockParent) codeBlockParent.addClass("fsrs-table-error");
        // Ошибка — тоже загружено (отображаем сообщение об ошибке)
        this.addLoadedClass();

        this.container.createEl("pre", {
            text: errorMessage,
            cls: "fsrs-table-error-text",
        });
    }

    // -----------------------------------------------------------------------
    // Обработчики событий
    // -----------------------------------------------------------------------

    private addEventListeners() {
        this.container
            .querySelectorAll(".fsrs-sort-header")
            .forEach((button) => {
                button.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const field = (button as HTMLElement).dataset.field;
                    if (field) {
                        void this.handleSortClick(field);
                    }
                });
            });
    }

    // -----------------------------------------------------------------------
    // Сортировка
    // -----------------------------------------------------------------------

    /**
     * Обрабатывает клик на заголовок сортировки.
     * Меняет params.sort и перезапрашивает данные через WASM.
     */
    private async handleSortClick(field: string) {
        if (!this.params) return;
        if (this.isRendering) return; // игнорируем клики во время рендеринга

        const nextDirection = this.getNextSortDirection(
            this.params.sort,
            field,
        );

        if (nextDirection === null) {
            delete this.params.sort;
        } else {
            this.params.sort = { field, direction: nextDirection };
        }

        await this.renderContent();
    }

    /**
     * Определяет следующее состояние сортировки для поля.
     * Цикл: ASC → DESC → none
     */
    private getNextSortDirection(
        currentSort: TableParams["sort"],
        field: string,
    ): "ASC" | "DESC" | null {
        if (!currentSort || currentSort.field !== field) {
            return "ASC";
        }
        if (currentSort.direction === "ASC") {
            return "DESC";
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Обновление (refresh)
    // -----------------------------------------------------------------------

    /**
     * Принудительное обновление таблицы.
     * Всегда запрашивает свежие данные из WASM-кэша.
     */
    async refresh() {
        await this.renderContent();
    }

    /**
     * Захватывает позиции и filePath всех строк таблицы до обновления.
     * Возвращает Map: filePath → DOMRect.
     */
    private captureRowPositions(): Map<string, DOMRect> {
        const rects = new Map<string, DOMRect>();
        const rows = this.container.querySelectorAll(
            "tr.fsrs-table-row[data-file-path]",
        );
        rows.forEach((row) => {
            const filePath = (row as HTMLElement).dataset.filePath;
            if (filePath) {
                rects.set(filePath, row.getBoundingClientRect());
            }
        });
        return rects;
    }

    /**
     * Применяет FLIP-анимацию: строки плавно перемещаются на новые позиции,
     * а новые строки проявляются (fade in).
     *
     * Классический FLIP:
     * 1. Invert: setCssProps мгновенно сдвигает строки в старые позиции
     * 2. Reflow: принудительный layout (offsetHeight)
     * 3. Play: сброс setCssProps → CSS transition оживляет строки
     *
     * @param oldRects Позиции строк до обновления (filePath → DOMRect).
     */
    private applyFlipAnimation(oldRects: Map<string, DOMRect>): void {
        const rows = this.container.querySelectorAll(
            "tr.fsrs-table-row[data-file-path]",
        );
        if (rows.length === 0) return;

        const MIN_DELTA = 0.5; // порог заметного смещения
        const ENTER_OFFSET = 12; // px, начальный сдвиг новой строки

        // Шаг 1 — Invert: мгновенно перемещаем строки в старые позиции
        const movedRows: HTMLElement[] = [];
        const newRows: HTMLElement[] = [];

        rows.forEach((row) => {
            const htmlRow = row as HTMLElement;
            const filePath = htmlRow.dataset.filePath;
            if (!filePath) return;

            const newRect = row.getBoundingClientRect();
            const oldRect = oldRects.get(filePath);

            if (oldRect) {
                const deltaY = oldRect.top - newRect.top;
                if (Math.abs(deltaY) > MIN_DELTA) {
                    // Инверсия: визуально возвращаем строку в старую позицию
                    htmlRow.setCssProps({
                        transform: `translateY(${deltaY}px)`,
                        transition: "none",
                    });
                    movedRows.push(htmlRow);
                }
            } else {
                // Новая строка: невидима и чуть ниже
                htmlRow.setCssProps({
                    opacity: "0",
                    transform: `translateY(${ENTER_OFFSET}px)`,
                    transition: "none",
                });
                newRows.push(htmlRow);
            }
        });

        // Шаг 2 — принудительный reflow, фиксирует инвертированные позиции
        if (movedRows.length > 0 || newRows.length > 0) {
            void this.container.offsetHeight;
        }

        // Шаг 3 — Play: сброс инлайн-стилей, CSS transition запускает анимацию
        for (const row of movedRows) {
            row.setCssProps({ transform: "", transition: "" });
        }
        for (const row of newRows) {
            row.setCssProps({ opacity: "", transform: "", transition: "" });
        }
    }

    /**
     * Вычисляет isDue для каждой карточки и возвращает массив CardForDisplay.
     */
    private addIsDue(cards: CachedCard[], now: Date): CardForDisplay[] {
        return cards.map(({ card, state }) => ({
            card,
            state,
            isDue: this.computeIsDue(state, now),
        }));
    }

    /**
     * Определяет, готова ли карточка к повторению.
     */
    private computeIsDue(state: ComputedCardState, now: Date): boolean {
        if (state.state === "Learning") return true;
        if (state.state === "Review") {
            if (!state.due) return false;
            try {
                return new Date(state.due).getTime() <= now.getTime();
            } catch {
                return false;
            }
        }
        return false;
    }
}
