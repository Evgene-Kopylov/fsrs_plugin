import { App, TFile } from "obsidian";
import { showNotice } from "../../utils/notice";
import { getLocalizedNoun, i18n } from "../../utils/i18n";
import {
    parseModernFsrsFromFrontmatter,
    addReviewSession,
    getNextReviewDates,
    isCardDue,
    computeCardState,
    formatLocalDate,
    getCardYamlAfterReview,
    getMinutesSinceLastReview,
    extractFrontmatterWithMatch,
} from "../../utils/fsrs-helper";
import type { FSRSRating } from "../../interfaces/fsrs";
import type MyPlugin from "../../main";
import { ReviewModal } from "./review-modal";

/**
 * Заменяет поле reviews в frontmatter на новое содержимое YAML
 * Сохраняет все остальные поля неизменными
 * @param frontmatter Исходный frontmatter (без разделителей ---)
 * @param reviewsYaml Новое содержимое поля reviews в формате YAML
 * @returns Обновленный frontmatter
 */
export function replaceReviewsInFrontmatter(
    frontmatter: string,
    reviewsYaml: string,
): string {
    const lines = frontmatter.split("\n");
    const result: string[] = [];
    let inReviewsBlock = false;
    let reviewsIndent = 0;
    let reviewsProcessed = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inReviewsBlock && /^reviews\s*:/i.test(trimmed)) {
            inReviewsBlock = true;
            reviewsIndent = line.search(/\S/);
            result.push(...reviewsYaml.split("\n"));
            reviewsProcessed = true;
            continue;
        }

        if (inReviewsBlock) {
            const currentIndent = line.search(/\S/);
            if (currentIndent > reviewsIndent) {
                continue;
            } else {
                inReviewsBlock = false;
            }
        }

        result.push(line);
    }

    if (!reviewsProcessed) {
        if (frontmatter.trim() !== "" && !frontmatter.endsWith("\n")) {
            result.push("");
        }
        result.push(...reviewsYaml.split("\n"));
    }

    return result.join("\n");
}

/**
 * Единая функция повторения карточки по объекту файла
 * Содержит всю общую логику
 */
async function reviewCardByFile(
    file: TFile,
    plugin: MyPlugin,
    app: App,
): Promise<FSRSRating | null> {
    const content = await app.vault.read(file);
    const frontmatterMatch = extractFrontmatterWithMatch(content);

    if (!frontmatterMatch) {
        showNotice("notices.no_frontmatter");
        return null;
    }

    const frontmatter = frontmatterMatch.content;

    const parseResult = parseModernFsrsFromFrontmatter(frontmatter, file.path);

    if (!parseResult.success || !parseResult.card) {
        showNotice("notices.not_fsrs_card");
        return null;
    }

    const card = parseResult.card;
    const isDue = await isCardDue(card, plugin.settings);

    if (!isDue) {
        const minutesSinceLastReview = getMinutesSinceLastReview(card);
        const minInterval = plugin.settings.minimum_review_interval_minutes;

        if (minutesSinceLastReview >= minInterval) {
            console.debug(
                `Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
            );
        } else {
            const remainingMinutes = minInterval - minutesSinceLastReview;
            const state = await computeCardState(card, plugin.settings);
            const nextDate = new Date(state.due);

            if (remainingMinutes > 0) {
                showNotice("notices.early_review_blocked", {
                    minutes: remainingMinutes,
                    noun: getLocalizedNoun(
                        remainingMinutes,
                        i18n.getLocale() === "ru" ? "минуту" : "minute",
                        i18n.getLocale() === "ru" ? "минуты" : "minutes",
                        i18n.getLocale() === "ru" ? "минут" : "minutes",
                    ),
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

    const modal = new ReviewModal(app, card);
    const rating = await modal.show();

    if (!rating) {
        showNotice("notices.review_cancelled");
        return null;
    }

    console.debug("Выбранная оценка:", rating);

    const updatedCard = await addReviewSession(card, rating, plugin.settings);
    console.debug("Обновленная карточка:", updatedCard);

    const updatedYaml = await getCardYamlAfterReview(
        card,
        rating,
        plugin.settings,
    );
    const updatedFrontmatter = replaceReviewsInFrontmatter(
        frontmatter,
        updatedYaml,
    );

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
        updatedFrontmatter +
        "\n---" +
        afterFrontmatter;

    await app.vault.modify(file, newContent);

    const nextDates = await getNextReviewDates(updatedCard, plugin.settings);
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

    console.debug("Следующие даты повторения:");
    Object.entries(nextDates).forEach(([rating, date]) => {
        if (date) {
            console.debug(`  ${rating}: ${new Date(date).toLocaleString()}`);
        }
    });

    return rating;
}

/**
 * Повторяет текущую карточку (активный файл)
 */
export async function reviewCurrentCard(
    app: App,
    plugin: MyPlugin,
): Promise<void> {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        showNotice("notices.no_active_file");
        return;
    }

    try {
        await reviewCardByFile(activeFile, plugin, app);
    } catch (error) {
        console.error("Ошибка при повторении карточки:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
    }
}

/**
 * Повторяет карточку по указанному пути файла
 */
export async function reviewCardByPath(
    app: App,
    plugin: MyPlugin,
    filePath: string,
): Promise<FSRSRating | null> {
    const file = app.vault.getFileByPath(filePath);
    if (!file) {
        showNotice("notices.file_not_found", { path: filePath });
        return null;
    }

    try {
        return await reviewCardByFile(file, plugin, app);
    } catch (error) {
        console.error("Ошибка при повторении карточки по пути:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        showNotice("notices.error_parsing_card", { error: errorMessage });
        return null;
    }
}
