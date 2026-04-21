import { App } from "obsidian";
import { showNotice, getLocalizedNoun, i18n } from "../../utils/i18n";
import {
    parseModernFsrsFromFrontmatter,
    addReviewSession,
    getNextReviewDates,
    isCardDue,
    computeCardState,
    formatLocalDate,
    updateReviewsInYaml,
    getMinutesSinceLastReview,
    extractFrontmatterWithMatch,
} from "../../utils/fsrs-helper";
import type { FSRSRating } from "../../interfaces/fsrs";
import type MyPlugin from "../../main";
import { ReviewModal } from "./review-modal";

/**
 * Основная функция повторения текущей карточки FSRS
 * @param app - Экземпляр приложения Obsidian
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function reviewCurrentCard(
    app: App,
    plugin: MyPlugin,
): Promise<void> {
    try {
        const activeFile = app.workspace.getActiveFile();
        if (!activeFile) {
            showNotice("notices.no_active_file");
            return;
        }

        const content = await app.vault.read(activeFile);

        // Ищем frontmatter
        const frontmatterMatch = extractFrontmatterWithMatch(content);

        if (!frontmatterMatch) {
            showNotice("notices.no_frontmatter");
            return;
        }

        const frontmatter = frontmatterMatch.content;

        // Парсим карточку в новом формате
        const parseResult = parseModernFsrsFromFrontmatter(
            frontmatter,
            activeFile.path,
        );

        if (!parseResult.success || !parseResult.card) {
            showNotice("notices.not_fsrs_card");
            return;
        }

        const card = parseResult.card;

        // Проверяем, готова ли карточка к повторению
        const isDue = await isCardDue(card, plugin.settings);

        if (!isDue) {
            // Карточка не готова к повторению - проверяем возможность досрочного повторения
            const minutesSinceLastReview = getMinutesSinceLastReview(card);
            const minInterval = plugin.settings.minimum_review_interval_minutes;

            if (minutesSinceLastReview >= minInterval) {
                // Достаточно времени прошло - разрешаем досрочное повторение
                console.debug(
                    `Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
                );
                // Продолжаем показ модального окна
            } else {
                // Недостаточно времени прошло - показываем информацию
                const remainingMinutes = minInterval - minutesSinceLastReview;
                const state = await computeCardState(card, plugin.settings);
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
                        date: formatLocalDate(nextDate, plugin.app),
                    });
                } else {
                    showNotice("notices.card_not_due", {
                        date: formatLocalDate(nextDate, plugin.app),
                    });
                }
                return;
            }
        }

        console.debug("Карточка для повторения:", card);

        // Показываем модальное окно для выбора оценки
        const modal = new ReviewModal(app, plugin, card);
        const rating = await modal.show();

        if (!rating) {
            showNotice("notices.review_cancelled");
            return;
        }

        console.debug("Выбранная оценка:", rating);

        // Добавляем сессию повторения
        const updatedCard = await addReviewSession(
            card,
            rating,
            plugin.settings,
        );

        console.debug("Обновленная карточка:", updatedCard);

        // Обновляем только поле reviews в YAML
        const updatedYaml = updateReviewsInYaml(
            frontmatter,
            updatedCard.reviews,
        );

        // Заменяем старый frontmatter на новый, сохраняя все остальные поля и пустые строки
        const beforeFrontmatter = content.substring(
            0,
            frontmatterMatch.match.index,
        );
        const afterFrontmatter = content.substring(
            frontmatterMatch.match.index + frontmatterMatch.match[0].length,
        );
        const newContent =
            beforeFrontmatter +
            "---\n" +
            updatedYaml +
            "\n---" +
            afterFrontmatter;

        // Сохраняем изменения
        await app.vault.modify(activeFile, newContent);

        // Получаем следующие даты повторения
        const nextDates = await getNextReviewDates(
            updatedCard,
            plugin.settings,
        );

        // Показываем уведомление с информацией

        if (nextDates[rating]) {
            const nextDate = new Date(nextDates[rating]);
            showNotice("notices.card_reviewed_with_next", {
                rating,
                date: nextDate.toLocaleDateString(),
            });
        } else {
            showNotice("notices.card_reviewed", { rating });
        }
        plugin.notifyFsrsTableRenderers();
        console.debug("Карточка успешно обновлена");

        // Логируем следующие даты для всех оценок
        console.debug("Следующие даты повторения:");
        Object.entries(nextDates).forEach(([rating, date]) => {
            if (date) {
                console.debug(
                    `  ${rating}: ${new Date(date).toLocaleString()}`,
                );
            }
        });
    } catch (error) {
        console.error("Ошибка при повторении карточки:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
    }
}

/**
 * Повторяет карточку по указанному пути файла
 * Может быть вызвана из frontmatter или других мест
 */
export async function reviewCardByPath(
    app: App,
    plugin: MyPlugin,
    filePath: string,
): Promise<FSRSRating | null> {
    try {
        // Получаем файл по пути
        const file = app.vault.getFileByPath(filePath);
        if (!file) {
            showNotice("notices.file_not_found", { path: filePath });
            return null;
        }

        const content = await app.vault.read(file);

        // Ищем frontmatter
        const frontmatterMatch = extractFrontmatterWithMatch(content);

        if (!frontmatterMatch) {
            showNotice("notices.no_frontmatter");
            return null;
        }

        const frontmatter = frontmatterMatch.content;

        // Парсим карточку в новом формате
        const parseResult = parseModernFsrsFromFrontmatter(
            frontmatter,
            filePath,
        );

        if (!parseResult.success || !parseResult.card) {
            showNotice("notices.not_fsrs_card");
            return null;
        }

        const card = parseResult.card;

        // Проверяем, готова ли карточка к повторению
        const isDue = await isCardDue(card, plugin.settings);

        if (!isDue) {
            // Карточка не готова к повторению - проверяем возможность досрочного повторения
            const minutesSinceLastReview = getMinutesSinceLastReview(card);
            const minInterval = plugin.settings.minimum_review_interval_minutes;

            if (minutesSinceLastReview >= minInterval) {
                // Достаточно времени прошло - разрешаем досрочное повторение
                console.debug(
                    `Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
                );
                // Продолжаем показ модального окна
            } else {
                // Недостаточно времени прошло - показываем информацию
                const remainingMinutes = minInterval - minutesSinceLastReview;
                const state = await computeCardState(card, plugin.settings);
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
                        date: formatLocalDate(nextDate, plugin.app),
                    });
                } else {
                    showNotice("notices.card_not_due", {
                        date: formatLocalDate(nextDate, plugin.app),
                    });
                }
                return null;
            }
        }

        console.debug("Карточка для повторения:", card);

        // Показываем модальное окно для выбора оценки
        const modal = new ReviewModal(app, plugin, card);
        const rating = await modal.show();

        if (!rating) {
            showNotice("notices.review_cancelled");
            return null;
        }

        console.debug("Выбранная оценка:", rating);

        // Добавляем сессию повторения
        const updatedCard = await addReviewSession(
            card,
            rating,
            plugin.settings,
        );

        console.debug("Обновленная карточка:", updatedCard);

        // Обновляем только поле reviews в YAML
        const updatedYaml = updateReviewsInYaml(
            frontmatter,
            updatedCard.reviews,
        );

        // Заменяем старый frontmatter на новый, сохраняя все остальные поля и пустые строки
        const beforeFrontmatter = content.substring(
            0,
            frontmatterMatch.match.index,
        );
        const afterFrontmatter = content.substring(
            frontmatterMatch.match.index + frontmatterMatch.match[0].length,
        );
        const newContent =
            beforeFrontmatter +
            "---\n" +
            updatedYaml +
            "\n---" +
            afterFrontmatter;

        // Сохраняем изменения
        await app.vault.modify(file, newContent);

        // Получаем следующие даты повторения
        const nextDates = await getNextReviewDates(
            updatedCard,
            plugin.settings,
        );

        // Показываем уведомление с информацией

        if (nextDates[rating]) {
            const nextDate = new Date(nextDates[rating]);
            showNotice("notices.card_reviewed_with_next", {
                rating,
                date: nextDate.toLocaleDateString(),
            });
        } else {
            showNotice("notices.card_reviewed", { rating });
        }
        plugin.notifyFsrsTableRenderers();
        console.debug("Карточка успешно обновлена");

        // Логируем следующие даты для всех оценок
        console.debug("Следующие даты повторения:");
        Object.entries(nextDates).forEach(([rating, date]) => {
            if (date) {
                console.debug(
                    `  ${rating}: ${new Date(date).toLocaleString()}`,
                );
            }
        });

        return rating;
    } catch (error) {
        console.error("Ошибка при повторении карточки по пути:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
        return null;
    }
}
