import { MarkdownRenderChild, TAbstractFile, TFile } from "obsidian";
import {
    parseCardDataFromFrontmatter,
    extractFrontmatterWithMatch,
    isCardDue,
    computeCardState,
    formatLocalDate,
    getMinutesSinceLastReview,
} from "../utils/fsrs-helper";
import type FsrsPlugin from "../main";
import type { RatingKey } from "../interfaces/fsrs";
import { numberToRating } from "../interfaces/fsrs";
import { ReviewHistoryModal } from "./review-history-modal";
import { showNotice } from "../utils/notice";
import { MINIMUM_REVIEW_INTERVAL_MINUTES } from "../constants";
import { getLocalizedNoun, i18n } from "../utils/i18n";

/**
 * Рендерер кнопки повторения карточки FSRS для блока `fsrs-review-button`
 * Инкапсулирует всю логику создания и управления кнопкой
 * Интегрируется с Obsidian's Markdown render lifecycle через MarkdownRenderChild
 */
export class ReviewButtonRenderer extends MarkdownRenderChild {
    private mainButton: HTMLButtonElement;
    private historyButton: HTMLButtonElement;

    private buttonsContainer: HTMLDivElement;

    private fileChangeHandler?: (file: TAbstractFile) => void;

    /** Элемент metadata-property[data-property-key="reviews"] для стилизации */
    private reviewsProperty: HTMLElement | null = null;

    /**
     * Создает новый рендерер кнопки
     * @param plugin - Экземпляр плагина FSRS
     * @param container - Контейнер для кнопки (div элемент)
     * @param sourceFile - Файл, в котором находится блок (стабильная ссылка TFile)
     */
    constructor(
        private plugin: FsrsPlugin,
        container: HTMLElement,
        private sourceFile: TFile,
    ) {
        super(container);

        // Создаем контейнер для кнопок
        this.buttonsContainer = createDiv();
        this.buttonsContainer.className = "fsrs-buttons-container";
        container.appendChild(this.buttonsContainer);

        // Создаем основную кнопку с фиксированной шириной
        this.mainButton = createEl("button");
        this.mainButton.className = "fsrs-review-button";

        // Создаем кнопку истории повторений
        this.historyButton = createEl("button");
        this.historyButton.className = "fsrs-history-button";
        this.historyButton.textContent = "📊";
        this.historyButton.title = i18n.t("reviewButton.history_tooltip");

        // Добавляем кнопки в контейнер
        this.buttonsContainer.appendChild(this.mainButton);
        this.buttonsContainer.appendChild(this.historyButton);

        // Устанавливаем фиксированный класс для контейнера
        container.className = "fsrs-review-button-container";
    }

    /**
     * Вызывается Obsidian при загрузке компонента
     */
    onload(): void {
        void this.updateButtonState();
        this.setupClickHandlers();
        this.setupFileWatcher();

        // Если WASM ещё не инициализирован — обновим кнопку после готовности
        this.plugin.onWasmReady(() => {
            void this.updateButtonState();
        });
    }

    /**
     * Вызывается Obsidian при выгрузке компонента
     */
    onunload(): void {
        this.cleanup();
        this.cleanupReviewsField();
    }

    /**
     * Обновляет состояние кнопки на основе текущего статуса карточки
     * Вызывается при инициализации и после повторения карточки
     */
    private async updateButtonState(): Promise<void> {
        try {
            if (!this.plugin.isWasmReady()) {
                this.mainButton.textContent = i18n.t("reviewButton.loading");
                this.mainButton.disabled = true;
                this.updateButtonClass("loading");
                return;
            }

            const file = this.plugin.app.vault.getFileByPath(
                this.sourceFile.path,
            );
            if (!file) {
                this.mainButton.textContent = i18n.t(
                    "reviewButton.file_not_found",
                );
                this.mainButton.disabled = true;
                this.updateButtonClass("error");
                return;
            }

            const content = await this.plugin.app.vault.read(file);
            const frontmatterMatch = extractFrontmatterWithMatch(content);

            if (!frontmatterMatch) {
                this.mainButton.textContent = i18n.t(
                    "reviewButton.no_frontmatter",
                );
                this.mainButton.disabled = true;
                this.updateButtonClass("error");
                return;
            }

            const frontmatter = frontmatterMatch.content;
            const parseResult = parseCardDataFromFrontmatter(
                frontmatter,
                this.sourceFile.path,
            );

            if (!parseResult.success || !parseResult.card) {
                // Карточка не является FSRS карточкой - кнопка активна, но затемнена
                this.mainButton.textContent = i18n.t("notices.not_fsrs_card");
                this.mainButton.disabled = false;
                this.updateButtonClass("not-fsrs");
                return;
            }

            const card = parseResult.card;
            this.styleReviewsField(card.reviews);
            const isDue = isCardDue(card, this.plugin.settings);

            if (!isDue) {
                // Карточка уже повторена - показываем последнюю оценку
                if (card.reviews.length > 0) {
                    const lastReview = card.reviews[card.reviews.length - 1];
                    if (lastReview) {
                        this.mainButton.textContent = i18n.t(
                            "reviewButton.review_with_rating",
                            {
                                rating: this.translateRating(
                                    numberToRating(lastReview.rating),
                                ),
                            },
                        );
                    } else {
                        this.mainButton.textContent = i18n.t(
                            "reviewButton.review",
                        );
                    }
                } else {
                    this.mainButton.textContent = i18n.t("reviewButton.review");
                }
                this.mainButton.disabled = false;
                this.updateButtonClass("reviewed");
            } else {
                // Карточка готова к повторению
                this.mainButton.textContent = i18n.t(
                    "reviewButton.review_card",
                );
                this.mainButton.disabled = false;
                this.updateButtonClass("due");
            }
        } catch (error) {
            console.error("Ошибка при обновлении состояния кнопки:", error);
            this.mainButton.textContent = i18n.t("reviewButton.error_loading");
            this.mainButton.disabled = true;
            this.updateButtonClass("error");
        }
    }

    /**
     * Обновляет CSS класс кнопки в зависимости от состояния
     */
    private updateButtonClass(
        state: "not-fsrs" | "reviewed" | "due" | "error" | "loading",
    ): void {
        // Удаляем все классы состояний
        this.mainButton.classList.remove(
            "fsrs-review-button--not-fsrs",
            "fsrs-review-button--reviewed",
            "fsrs-review-button--due",
            "fsrs-review-button--error",
            "fsrs-review-button--loading",
        );

        // Добавляем текущий класс состояния
        this.mainButton.classList.add(`fsrs-review-button--${state}`);
    }

    /**
     * Возвращает отображаемое название оценки
     * Приоритет: custom label > i18n перевод
     */
    private translateRating(rating: RatingKey): string {
        const custom = this.plugin.settings.customButtonLabels?.[rating];
        if (custom && custom.trim() !== "") return custom;
        return i18n.t(`review.buttons.${rating}`);
    }

    /**
     * Стилизует поле reviews во фронтматтере: скрывает сырое значение,
     * показывает цветные плиточки с тултипами.
     */
    private styleReviewsField(
        reviews: Array<{ date: string; rating: number }>,
    ): void {
        // Найти metadata-property[data-property-key="reviews"]
        let ancestor = this.containerEl.parentElement;
        while (ancestor && !ancestor.querySelector(".metadata-container")) {
            ancestor = ancestor.parentElement;
        }
        const prop: HTMLElement | null =
            ancestor?.querySelector(
                '.metadata-property[data-property-key="reviews"]',
            ) ?? null;

        // Если элемент не найден или пустые reviews — убрать старые плиточки и выйти
        if (!prop || reviews.length === 0) {
            this.cleanupReviewsField();
            this.reviewsProperty = null;
            return;
        }

        // Удалить предыдущие плиточки если свойство то же самое
        if (this.reviewsProperty === prop) {
            const existing = prop.querySelector(".fsrs-reviews-pills");
            if (existing) existing.remove();
        } else if (prop.querySelector(".fsrs-reviews-pills")) {
            // Другой рендерер уже создал плиточки — не дублировать
            this.cleanupReviewsField();
            this.reviewsProperty = prop;
            return;
        } else {
            this.cleanupReviewsField();
        }
        this.reviewsProperty = prop;

        // Создать контейнер плиточек
        const pills = createDiv({ cls: "fsrs-reviews-pills" });

        for (const r of reviews) {
            const key = numberToRating(r.rating);

            // Цвет: кастомный или CSS-переменная
            const customColor = this.plugin.settings.customButtonColors?.[key];
            const color =
                customColor && customColor.trim() !== ""
                    ? customColor
                    : `var(--fsrs-color-${key})`;

            // Лейбл: кастомный или i18n (без номера клавиши)
            const customLabel = this.plugin.settings.customButtonLabels?.[key];
            const label =
                customLabel && customLabel.trim() !== ""
                    ? customLabel
                    : i18n.t(`review.buttons.${key}`).replace(/ \(\d\)$/, "");

            const pill = pills.createDiv({ cls: "fsrs-reviews-pill" });
            pill.style.backgroundColor = color;

            // Тултип внутри плиточки
            const tip = pill.createDiv({ cls: "fsrs-reviews-pill-tip" });

            // Дата без времени
            const d = window.moment(r.date);
            const dateStr = d.isValid() ? d.format("YYYY-MM-DD") : r.date;
            tip.createSpan({ text: dateStr });
            tip.createSpan({ text: " " });

            // Оценка цветным лейблом
            tip.createSpan({
                text: label,
                cls: `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r${r.rating}`,
            });
        }

        prop.classList.add("fsrs-reviews-styled");
        prop.appendChild(pills);
    }

    /** Убирает плиточки и восстанавливает видимость сырого значения */
    private cleanupReviewsField(): void {
        if (this.reviewsProperty) {
            this.reviewsProperty.classList.remove("fsrs-reviews-styled");
            const pills = this.reviewsProperty.querySelector(
                ".fsrs-reviews-pills",
            );
            if (pills) pills.remove();
            this.reviewsProperty = null;
        }
    }

    /**
     * Настраивает обработчики клика на кнопках
     */
    private setupClickHandlers(): void {
        // Основная кнопка
        const mainClickHandler = () => {
            void this.handleMainButtonClick();
        };
        this.mainButton.addEventListener("click", mainClickHandler);
        (
            this.mainButton as HTMLElement & {
                _clickHandler?: typeof mainClickHandler;
            }
        )._clickHandler = mainClickHandler;

        // Кнопка истории повторений
        const historyClickHandler = () => {
            void this.handleHistoryButtonClick();
        };
        this.historyButton.addEventListener("click", historyClickHandler);
        (
            this.historyButton as HTMLElement & {
                _clickHandler?: typeof historyClickHandler;
            }
        )._clickHandler = historyClickHandler;
    }

    /**
     * Очищает обработчики событий
     */
    private cleanup(): void {
        const mainButtonWithHandler = this.mainButton as HTMLElement & {
            _clickHandler?: () => Promise<void>;
        };
        if (this.mainButton && mainButtonWithHandler._clickHandler) {
            const handler = mainButtonWithHandler._clickHandler as (
                ev: Event,
            ) => void;
            this.mainButton.removeEventListener("click", handler);
            delete mainButtonWithHandler._clickHandler;
        }

        const historyButtonWithHandler = this.historyButton as HTMLElement & {
            _clickHandler?: () => Promise<void>;
        };
        if (this.historyButton && historyButtonWithHandler._clickHandler) {
            const handler = historyButtonWithHandler._clickHandler as (
                ev: Event,
            ) => void;
            this.historyButton.removeEventListener("click", handler);
            delete historyButtonWithHandler._clickHandler;
        }
    }

    /**
     * Обрабатывает клик на основной кнопке
     */
    private async handleMainButtonClick(): Promise<void> {
        try {
            // Блокируем кнопки на время обработки
            this.mainButton.disabled = true;

            // Проверяем статус карточки перед открытием модального окна
            const file = this.plugin.app.vault.getFileByPath(
                this.sourceFile.path,
            );
            if (!file) {
                showNotice("notices.file_not_found", {
                    path: this.sourceFile.path,
                });
                await this.updateButtonState();
                return;
            }

            const content = await this.plugin.app.vault.read(file);
            const frontmatterMatch = extractFrontmatterWithMatch(content);

            if (!frontmatterMatch) {
                showNotice("notices.no_frontmatter");
                await this.updateButtonState();
                return;
            }

            const frontmatter = frontmatterMatch.content;
            const parseResult = parseCardDataFromFrontmatter(
                frontmatter,
                this.sourceFile.path,
            );

            if (!parseResult.success || !parseResult.card) {
                // Карточка не является FSRS карточкой - показываем уведомление
                showNotice("notices.not_fsrs_card");
                // Обновляем состояние кнопки (на случай, если статус изменился)
                await this.updateButtonState();
                return;
            }

            const card = parseResult.card;
            const isDue = isCardDue(card, this.plugin.settings);

            if (!isDue) {
                // Карточка не готова к повторению - проверяем возможность досрочного повторения
                const minutesSinceLastReview = getMinutesSinceLastReview(card);
                const minInterval = MINIMUM_REVIEW_INTERVAL_MINUTES;

                if (minutesSinceLastReview >= minInterval) {
                    // Достаточно времени прошло - разрешаем досрочное повторение
                    console.debug(
                        `Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
                    );
                    // Продолжаем показ модального окна
                } else {
                    // Недостаточно времени прошло - показываем информацию
                    const remainingMinutes =
                        minInterval - minutesSinceLastReview;
                    const state = computeCardState(card, this.plugin.settings);
                    const nextDate = new Date(state.due);

                    if (remainingMinutes > 0) {
                        const noun = getLocalizedNoun(
                            remainingMinutes,
                            i18n.getLocale() === "ru" ? "минуту" : "minute",
                            i18n.getLocale() === "ru" ? "минуты" : "minutes",
                            i18n.getLocale() === "ru" ? "минут" : "minutes",
                        );
                        showNotice("notices.early_review_blocked", {
                            minutes: remainingMinutes,
                            noun: noun,
                            date: formatLocalDate(nextDate, this.plugin.app),
                        });
                    } else {
                        showNotice("notices.card_not_due", {
                            date: formatLocalDate(nextDate, this.plugin.app),
                        });
                    }
                    await this.updateButtonState();
                    return;
                }
            }

            // Карточка готова к повторению - вызываем стандартный ревью
            const rating = await this.plugin.reviewCardByPath(
                this.sourceFile.path,
            );

            if (rating) {
                // После успешного ревью сразу обновляем состояние кнопки
                await this.updateButtonState();
            } else {
                // Ревью отменено - восстанавливаем состояние
                await this.updateButtonState();
            }
        } catch (error) {
            console.error("Ошибка при обработке карточки:", error);
            showNotice("notices.card_processing_error");
            // Восстанавливаем состояние при ошибке
            await this.updateButtonState();
        }
    }

    /**
     * Настраивает отслеживание изменений файла
     */
    private setupFileWatcher(): void {
        this.fileChangeHandler = (file: TAbstractFile) => {
            if (file.path === this.sourceFile.path) {
                void this.refresh();
            }
        };
        this.registerEvent(
            this.plugin.app.vault.on("modify", this.fileChangeHandler),
        );
    }

    /**
     * Обрабатывает клик на кнопке истории повторений
     */
    private async handleHistoryButtonClick(): Promise<void> {
        try {
            const modal = new ReviewHistoryModal(
                this.plugin.app,
                this.plugin,
                this.sourceFile.path,
            );
            await modal.show();
        } catch (error) {
            console.error("Ошибка при открытии истории повторений:", error);
            showNotice("notices.review_history_error");
        }
    }

    /**

     * Обновляет рендерер (например, при изменении файла)
     * Может быть вызван извне для принудительного обновления
     */
    private async refresh(): Promise<void> {
        await this.updateButtonState();
    }
}
