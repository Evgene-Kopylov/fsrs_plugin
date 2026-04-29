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
    ModernFSRSCard,
} from "../interfaces/fsrs";
import { generateTableDOM } from "../utils/fsrs-table-helpers";
import { i18n } from "../utils/i18n";
import { verboseLog } from "../utils/logger";

/**
 * Внутреннее представление карточки для генерации DOM.
 * Дублирует CardWithState, но не требует импорта из fsrs-table-filter.
 */
interface CardForDisplay {
    card: ModernFSRSCard;
    state: ComputedCardState;
    isDue: boolean;
}

export class FsrsTableRenderer extends MarkdownRenderChild {
    private params: TableParams | null = null;
    private isRendering = false;
    private sourceText: string;

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
        this.isRendering = true;
        const start = performance.now();

        // ДИАГНОСТИКА: кто вызывает renderContent
        verboseLog(
            "🔄 renderContent вызван:",
            new Error().stack?.split("\n").slice(2, 5).join(" | "),
        );

        try {
            // Убираем класс ошибки
            this.container.removeClass("fsrs-table-error");
            const codeBlockParent = this.container.closest(
                ".block-language-fsrs-table, " +
                    ".cm-preview-code-block.block-language-fsrs-table, " +
                    ".cm-embed-block.block-language-fsrs-table",
            );
            if (codeBlockParent)
                codeBlockParent.removeClass("fsrs-table-error");

            // Показываем loading (перезатирает старый loading из onload при первом вызове)
            this.showLoadingIndicator();
            this.container.classList.add("fsrs-table-loading");

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

            if (result.cards.length === 0) {
                this.renderEmptyState();
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

            // Добавляем обработчики событий для сортировки
            this.addEventListeners();

            // Восстанавливаем полную прозрачность после обновления
            this.container.classList.remove("fsrs-table-loading");
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

    private showLoadingIndicator() {
        this.container.empty();
        const loadingDiv = this.container.createDiv({
            cls: "fsrs-table-loading",
        });
        loadingDiv.createEl("small", {
            text: i18n.t("table.loading"),
        });
    }

    private renderEmptyState() {
        this.container.empty();
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
        const codeBlockParent = this.container.closest(
            ".block-language-fsrs-table, " +
                ".cm-preview-code-block.block-language-fsrs-table, " +
                ".cm-embed-block.block-language-fsrs-table",
        );
        if (codeBlockParent) codeBlockParent.addClass("fsrs-table-error");

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

    // -----------------------------------------------------------------------
    // Утилиты
    // -----------------------------------------------------------------------

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
     * Определяет, является ли карточка просроченной.
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
