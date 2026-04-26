import { MarkdownRenderChild } from "obsidian";
import type FsrsPlugin from "../main";
import type { CachedCard, ModernFSRSCard } from "../interfaces/fsrs";
import type { TableParams, CardWithState } from "../utils/fsrs-table-helpers";
import {
    generateTableDOM,
    generateTableDOMFromCards,
    generateTableDOMFromSql,
} from "../utils/fsrs-table-helpers";
import { i18n } from "../utils/i18n";
import { verboseLog } from "../utils/logger";

/**
 * Класс для динамического рендеринга блока fsrs-table
 * Отображает все карточки
 */
export class FsrsTableRenderer extends MarkdownRenderChild {
    private params: TableParams | null = null;
    private isFirstLoad = true;
    private activeLeafCallback?: () => void;
    private lastVisibilityUpdate = 0;
    private lastAction: "sort" | "refresh" | null = null;
    private cachedCards: CachedCard[] | null = null;
    private cachedCardsWithState: CardWithState[] | null = null;
    private cachedTotalCount: number = 0;
    private originalCardsWithState: CardWithState[] | null = null;
    private sourceText: string;

    constructor(
        private plugin: FsrsPlugin,
        private container: HTMLElement,
        private sourcePath: string,
        source: string,
    ) {
        super(container);
        this.params = null;
        this.sourceText = source;
    }

    /**
     * Вызывается при загрузке компонента
     */
    onload(): void {
        super.onload();
        // Регистрируем рендерер в плагине для уведомлений об обновлениях
        this.plugin.registerFsrsTableRenderer(this);

        // Регистрируем обработчик для обновления таблицы при возвращении видимости
        this.activeLeafCallback = () => {
            this.updateIfVisible().catch((error) => {
                console.error(
                    "Ошибка при обновлении таблицы при возвращении видимости:",
                    error,
                );
            });
        };
        this.registerEvent(
            this.plugin.app.workspace.on(
                "active-leaf-change",
                this.activeLeafCallback,
            ),
        );

        void (async () => {
            await this.renderContent();
            this.isFirstLoad = false;
        })();
    }

    /**
     * Вызывается при выгрузке компонента
     */
    onunload() {
        // Удаляем рендерер из списка активных
        this.plugin.unregisterFsrsTableRenderer(this);
        super.onunload();
    }

    /**
     * Основной метод рендеринга контента с поддержкой плавной анимации
     */
    private async renderContent() {
        const start = performance.now();
        try {
            // Убираем класс ошибки при успешном рендере
            this.container.removeClass("fsrs-table-error");
            // Также убираем класс ошибки у родительского элемента блока кода
            const codeBlockParent = this.container.closest(
                ".block-language-fsrs-table, .cm-preview-code-block.block-language-fsrs-table, .cm-embed-block.block-language-fsrs-table",
            );
            if (codeBlockParent) {
                codeBlockParent.removeClass("fsrs-table-error");
            }
            // При первом показе используем индикатор загрузки
            if (this.isFirstLoad) {
                this.showLoadingIndicator();
            } else {
                // При последующих обновлениях применяем плавную анимацию opacity
                this.container.classList.add("fsrs-table-loading");
            }

            // Получаем все карточки через плагин, при сортировке используем кеш
            const allCards =
                this.lastAction === "sort" && this.cachedCards
                    ? this.cachedCards
                    : await this.plugin.getCachedCardsWithState();
            const now = new Date();

            // Отладочный вывод для отслеживания параметров
            console.debug("FsrsTableRenderer.renderContent:", {
                cardCount: allCards.length,
                hasParams: !!this.params,
                params: this.params
                    ? (JSON.parse(JSON.stringify(this.params)) as unknown)
                    : null,
                sourceText: this.sourceText,
                lastAction: this.lastAction,
                hasSort: this.params?.sort ? true : false,
            });

            if (allCards.length === 0) {
                this.renderEmptyState();
                return;
            }

            // Проверяем на пустой SQL запрос (только при первом рендере)
            if (
                !this.params &&
                (!this.sourceText || this.sourceText.trim() === "")
            ) {
                this.renderErrorState(new Error("Пустой блок fsrs-table"));
                return;
            }

            let container: HTMLDivElement;
            // Генерируем DOM таблицы
            if (this.params) {
                // Если параметры уже есть (при сортировке), используем их
                console.debug(
                    "Using existing params for table generation:",
                    this.params,
                );
                const result = await generateTableDOMFromCards(
                    allCards,
                    this.params,
                    this.plugin.settings,
                    this.plugin.app,
                    now,
                );
                container = result.container;
                this.cachedCardsWithState = result.cards;
                this.cachedTotalCount = result.totalCount;
                if (this.originalCardsWithState === null) {
                    this.originalCardsWithState = result.cards;
                }
            } else {
                // При первом рендере используем SQL напрямую
                console.debug(
                    "Parsing SQL source for table generation:",
                    this.sourceText,
                );
                const result = await generateTableDOMFromSql(
                    allCards.map((c) => c.card),
                    this.sourceText,
                    this.plugin.settings,
                    this.plugin.app,
                    now,
                );
                container = result.container;
                this.params = result.params;
                this.cachedCardsWithState = result.cards;
                this.cachedTotalCount = result.totalCount;
                if (this.originalCardsWithState === null) {
                    this.originalCardsWithState = result.cards;
                }
                console.debug("Parsed params from SQL:", this.params);
            }

            // Если задано WHERE, кэшируем только карточки, прошедшие фильтр
            if (this.params?.where && this.cachedCardsWithState) {
                const filteredPaths = new Set(
                    this.cachedCardsWithState.map((c) => c.card.filePath),
                );
                this.cachedCards = allCards.filter((c) =>
                    filteredPaths.has(c.card.filePath),
                );
            } else {
                this.cachedCards = allCards;
            }

            // Сохраняем позицию прокрутки перед обновлением
            const scrollContainer = this.container.querySelector(
                ".fsrs-table-container",
            );
            const savedScrollLeft = scrollContainer?.scrollLeft ?? 0;

            // Очищаем контейнер и вставляем DOM элементы
            this.container.empty();
            this.container.appendChild(container);

            // Восстанавливаем позицию прокрутки
            const newScrollContainer = this.container.querySelector(
                ".fsrs-table-container",
            );
            if (newScrollContainer && savedScrollLeft > 0) {
                newScrollContainer.scrollLeft = savedScrollLeft;
            }

            // Добавляем обработчики событий для кликабельных ссылок
            this.addEventListeners();

            // Восстанавливаем полную прозрачность после обновления
            if (!this.isFirstLoad) {
                this.container.classList.remove("fsrs-table-loading");
            }

            // Обновляем время последнего обновления
            this.lastVisibilityUpdate = Date.now();
        } catch (error) {
            this.renderErrorState(error);
        } finally {
            const elapsedMs = performance.now() - start;
            const elapsedSec = elapsedMs / 1000;
            verboseLog(`⏱️ Загрузка таблицы FSRS: ${elapsedSec.toFixed(2)} с`);
        }
    }

    /**
     * Показывает индикатор загрузки (только при первом отображении)
     */
    private showLoadingIndicator() {
        this.container.empty();
        const loadingDiv = this.container.createDiv({
            cls: "fsrs-table-loading",
        });
        loadingDiv.createEl("small", {
            text: i18n.t("table.loading"),
        });
    }

    /**
     * Отображает состояние "нет карточек"
     */
    private renderEmptyState() {
        // При пустом состоянии также применяем анимацию, если это не первый показ
        if (!this.isFirstLoad) {
            this.container.classList.add("fsrs-table-loading");
        }
        this.container.empty();
        const emptyDiv = this.container.createDiv({ cls: "fsrs-table-empty" });
        emptyDiv.createEl("small", { text: i18n.t("table.no_cards") });
        if (!this.isFirstLoad) {
            this.container.classList.remove("fsrs-table-loading");
        }
    }

    /**
     * Отображает состояние ошибки в виде простого текста без стилей
     */
    private renderErrorState(error: unknown) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.debug(
            `Ошибка при рендеринге блока fsrs-table: ${errorMessage}`,
        );

        // Добавляем класс ошибки и очищаем контейнер
        this.container.addClass("fsrs-table-error");
        // Также добавляем класс ошибки родительскому элементу блока кода
        const codeBlockParent = this.container.closest(
            ".block-language-fsrs-table, .cm-preview-code-block.block-language-fsrs-table, .cm-embed-block.block-language-fsrs-table",
        );
        if (codeBlockParent) {
            codeBlockParent.addClass("fsrs-table-error");
        }
        this.container.empty();
        this.container.createEl("pre", {
            text: errorMessage,
            cls: "fsrs-table-error-text",
        });
    }

    /**
     * Добавляет обработчики событий для кликабельных элементов
     */
    private addEventListeners() {
        // Обработчик для заголовков сортировки в таблице
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

    /**
     * Обновляет содержимое блока с поддержкой анимации
     * Может быть вызвано извне для принудительного обновления
     */
    async refresh() {
        if (this.lastAction !== "sort") {
            this.lastAction = "refresh";
        }
        // Сбрасываем кэш при полном обновлении
        this.cachedCards = null;
        this.cachedCardsWithState = null;
        this.cachedTotalCount = 0;
        this.originalCardsWithState = null;
        await this.renderContent();
        this.lastAction = null;
    }

    /**
     * Обновляет таблицу, если файл активен и прошло достаточно времени
     */
    private async updateIfVisible(): Promise<void> {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile || activeFile.path !== this.sourcePath) {
            return;
        }

        // Дебаунс: обновляем не чаще чем..
        const now = Date.now();
        if (now - this.lastVisibilityUpdate > 2000) {
            this.lastVisibilityUpdate = now;
            try {
                await this.refresh();
            } catch (error) {
                console.error(
                    "Ошибка при обновлении таблицы fsrs-table:",
                    error,
                );
            }
        }
    }

    /**
     * Обрабатывает клик на заголовок для сортировки
     * @param field Поле, по которому нужно сортировать
     */
    private async handleSortClick(field: string) {
        if (!this.params) return;
        // Определяем следующее состояние сортировки
        const nextDirection = this.getNextSortDirection(field);

        // Обновляем параметры
        if (nextDirection === null) {
            // Удаляем параметр сортировки
            delete this.params.sort;
        } else {
            // Устанавливаем или обновляем параметр сортировки
            this.params.sort = { field, direction: nextDirection };
        }

        this.lastAction = "sort";

        console.debug("handleSortClick:", {
            field,
            nextDirection,
            params: this.params
                ? (JSON.parse(JSON.stringify(this.params)) as unknown)
                : null,
        });

        // Если есть кэшированные карточки, сортируем локально
        if (this.cachedCardsWithState && this.originalCardsWithState) {
            let cardsToRender = this.cachedCardsWithState;

            if (nextDirection === null) {
                // Снятие сортировки: возвращаемся к исходному порядку
                cardsToRender = [...this.originalCardsWithState];
                // originalCardsWithState уже содержит правильную сортировку из WASM
                // (включая сортировку из SQL, если она была)
            } else {
                // Применяем новую сортировку
                cardsToRender = this.sortCards(
                    cardsToRender,
                    field,
                    nextDirection,
                );
            }

            // Обновляем кэш отсортированными карточками
            this.cachedCardsWithState = cardsToRender;

            // Перерисовываем таблицу из кэша
            await this.renderFromCache();
        } else {
            // Если кэша нет, выполняем полное обновление
            await this.refresh();
        }
    }

    /**
     * Возвращает следующее направление сортировки для поля
     * Логика: нет параметра → ASC → DESC → нет параметра
     * @param field Поле для сортировки
     * @returns Следующее направление сортировки или null для снятия сортировки
     */
    private getNextSortDirection(field: string): "ASC" | "DESC" | null {
        if (!this.params) return null;
        const currentSort = this.params.sort;

        // Если сортируем по другому полю, начинаем с ASC
        if (!currentSort || currentSort.field !== field) {
            return "ASC";
        }

        // Переключаем направление: ASC → DESC → снять сортировку
        if (currentSort.direction === "ASC") {
            return "DESC";
        } else {
            // DESC → снять сортировку
            return null;
        }
    }

    /**
     * Сортирует массив карточек на JavaScript по указанному полю и направлению
     * @param cards Массив карточек с состояниями
     * @param field Поле для сортировки
     * @param direction Направление сортировки
     * @returns Отсортированный массив
     */
    private sortCards(
        cards: CardWithState[],
        field: string,
        direction: "ASC" | "DESC",
    ): CardWithState[] {
        return [...cards].sort((a, b) => {
            let valueA: string | number;
            let valueB: string | number;

            // Получаем значения в зависимости от поля
            switch (field) {
                case "file":
                    valueA = a.card.filePath.toLowerCase();
                    valueB = b.card.filePath.toLowerCase();
                    break;
                case "reps":
                    valueA = a.state.reps;
                    valueB = b.state.reps;
                    break;
                case "overdue":
                    valueA = a.state.overdue ?? 0;
                    valueB = b.state.overdue ?? 0;
                    break;
                case "stability":
                    valueA = a.state.stability;
                    valueB = b.state.stability;
                    break;
                case "difficulty":
                    valueA = a.state.difficulty;
                    valueB = b.state.difficulty;
                    break;
                case "retrievability":
                    valueA = a.state.retrievability;
                    valueB = b.state.retrievability;
                    break;
                case "due":
                    // Сравниваем строки дат лексикографически (формат YYYY-MM-DD_HH:MM)
                    valueA = a.state.due;
                    valueB = b.state.due;
                    break;
                case "state":
                    valueA = a.state.state;
                    valueB = b.state.state;
                    break;
                case "elapsed":
                    valueA = a.state.elapsed_days;
                    valueB = b.state.elapsed_days;
                    break;
                case "scheduled":
                    valueA = a.state.scheduled_days;
                    valueB = b.state.scheduled_days;
                    break;
                default: {
                    // Для неизвестных полей сортируем как строки
                    const valA = a.card[field as keyof ModernFSRSCard];
                    valueA =
                        typeof valA === "string" || typeof valA === "number"
                            ? String(valA)
                            : "";
                    const valB = b.card[field as keyof ModernFSRSCard];
                    valueB =
                        typeof valB === "string" || typeof valB === "number"
                            ? String(valB)
                            : "";
                    break;
                }
            }

            // Сравниваем значения
            let comparison = 0;
            if (typeof valueA === "number" && typeof valueB === "number") {
                comparison = valueA - valueB;
            } else if (
                typeof valueA === "string" &&
                typeof valueB === "string"
            ) {
                comparison = valueA.localeCompare(valueB);
            } else {
                // Смешанные типы - преобразуем к строке
                comparison = String(valueA).localeCompare(String(valueB));
            }

            // Учитываем направление сортировки
            return direction === "ASC" ? comparison : -comparison;
        });
    }

    /**
     * Перерисовывает таблицу из кэшированных карточек без вызова WASM
     */
    private async renderFromCache() {
        if (!this.cachedCardsWithState || !this.params) return;

        const start = performance.now();
        try {
            // Сохраняем позицию прокрутки перед обновлением
            const scrollContainer = this.container.querySelector(
                ".fsrs-table-container",
            );
            const savedScrollLeft = scrollContainer?.scrollLeft ?? 0;

            // Генерируем DOM таблицы из кэша
            const container = generateTableDOM(
                this.cachedCardsWithState,
                this.cachedTotalCount,
                this.params,
                this.plugin.settings,
                this.plugin.app,
                new Date(),
            );

            // Очищаем контейнер и вставляем DOM элементы
            this.container.empty();
            this.container.appendChild(container);

            // Восстанавливаем позицию прокрутки
            const newScrollContainer = this.container.querySelector(
                ".fsrs-table-container",
            );
            if (newScrollContainer && savedScrollLeft > 0) {
                newScrollContainer.scrollLeft = savedScrollLeft;
            }

            // Добавляем обработчики событий для кликабельных ссылок
            this.addEventListeners();

            // Обновляем время последнего обновления
            this.lastVisibilityUpdate = Date.now();
        } catch (error) {
            console.error("Ошибка при перерисовке из кэша:", error);
            // В случае ошибки выполняем полное обновление
            await this.refresh();
        } finally {
            const elapsedMs = performance.now() - start;
            const elapsedSec = elapsedMs / 1000;
            verboseLog(
                `⏱️ Быстрая сортировка таблицы FSRS: ${elapsedSec.toFixed(2)} с`,
            );
        }
    }
}
