import { MarkdownRenderChild, Notice } from "obsidian";
import type FsrsPlugin from "../main";
import type { CachedCard } from "../interfaces/fsrs";
import type { TableParams } from "../utils/fsrs-table-helpers";
import {
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
        this.plugin.app.workspace.on(
            "active-leaf-change",
            this.activeLeafCallback,
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
        // Удаляем обработчик активного листа
        if (this.activeLeafCallback) {
            this.plugin.app.workspace.off(
                "active-leaf-change",
                this.activeLeafCallback,
            );
            this.activeLeafCallback = undefined;
        }

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
                this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
                this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
            }

            // Получаем все карточки через плагин, при сортировке используем кеш
            const allCards =
                this.lastAction === "sort" && this.cachedCards
                    ? this.cachedCards
                    : await this.plugin.getCachedCardsWithState();
            // Сохраняем карточки в кеш для будущих сортировок
            this.cachedCards = allCards;
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
                container = await generateTableDOMFromCards(
                    allCards,
                    this.params,
                    this.plugin.settings,
                    this.plugin.app,
                    now,
                );
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
                console.debug("Parsed params from SQL:", this.params);
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
                this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
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
            this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
            this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
        }
        this.container.empty();
        const emptyDiv = this.container.createDiv({ cls: "fsrs-table-empty" });
        emptyDiv.createEl("small", { text: i18n.t("table.no_cards") });
        if (!this.isFirstLoad) {
            this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
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
        // Обработчики для ссылок на файлы
        this.container.querySelectorAll(".internal-link").forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                const filePath = (link as HTMLElement).dataset.filePath;
                if (filePath) {
                    void this.openFile(filePath);
                }
            });
        });

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
     * Открывает файл в Obsidian
     */
    private async openFile(filePath: string) {
        try {
            const file = this.plugin.app.vault.getFileByPath(filePath);
            if (file) {
                await this.plugin.app.workspace.openLinkText(
                    filePath,
                    "",
                    true,
                );
            } else {
                void new Notice(`File not found: ${filePath}`);
            }
        } catch (error) {
            console.error("Ошибка при открытии файла:", error);
            void new Notice(`Could not open file: ${filePath}`);
        }
    }

    /**
     * Обновляет содержимое блока с поддержкой анимации
     * Может быть вызвано извне для принудительного обновления
     */
    async refresh() {
        if (this.lastAction !== "sort") {
            this.lastAction = "refresh";
        }
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

        // Перерисовываем таблицу с новыми параметрами сортировки
        await this.refresh();
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
}
