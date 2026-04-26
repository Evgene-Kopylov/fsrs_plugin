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
 * Устойчива к различным форматированиям (кавычки, форматы дат, пробелы)
 * Удаляет ВСЕ существующие блоки reviews и заменяет их одним новым блоком
 * Сохраняет позицию и отступ первого найденного блока reviews
 * @param frontmatter Исходный frontmatter (без разделителей ---)
 * @param reviewsYaml Новое содержимое поля reviews в формате YAML (без отступов)
 * @returns Обновленный frontmatter
 */
export function replaceReviewsInFrontmatter(
    frontmatter: string,
    reviewsYaml: string,
): string {
    const lines = frontmatter.split("\n");
    const resultLines: string[] = [];
    let i = 0;
    let firstReviewsIndex = -1;
    let firstReviewsIndent = 0;
    let foundAnyReviews = false;

    // Проходим по всем строкам
    while (i < lines.length) {
        const line = lines[i]!;
        const match = line.match(/^(\s*)reviews\s*:/);

        if (match) {
            foundAnyReviews = true;
            const baseIndent = match[1]!.length;

            // Запоминаем позицию и отступ первого блока reviews
            if (firstReviewsIndex === -1) {
                firstReviewsIndex = resultLines.length;
                firstReviewsIndent = baseIndent;
            }

            // Пропускаем весь блок reviews
            i++; // Переходим к следующей строке после "reviews:"

            // Пропускаем все строки, которые являются частью блока reviews
            while (i < lines.length) {
                const nextLine = lines[i]!;
                const indent = nextLine.search(/\S/);

                if (indent === -1) {
                    // Пустая строка - часть блока
                    i++;
                } else if (indent > baseIndent) {
                    // Строка с большим отступом - часть блока
                    i++;
                } else if (
                    indent === baseIndent &&
                    nextLine.substring(indent).startsWith("- ")
                ) {
                    // Строка с тем же отступом, начинающаяся с "- " - элемент YAML списка, часть блока
                    i++;
                } else {
                    // Строка с отступом <= baseIndent и не элемент списка - конец блока
                    break;
                }
            }
            // Продолжаем цикл, не добавляя старый блок в результат
            continue;
        }

        // Если это не блок reviews, добавляем строку в результат
        resultLines.push(line);
        i++;
    }

    // Подготавливаем новый блок reviews с правильным отступом
    const newBlockLines = reviewsYaml.split("\n").map((line) => {
        if (line.trim() === "") return line;
        // Если нашли блок reviews, используем его отступ, иначе без отступа
        const indent = foundAnyReviews ? firstReviewsIndent : 0;
        return " ".repeat(indent) + line;
    });

    // Вставляем новый блок reviews
    if (foundAnyReviews && firstReviewsIndex !== -1) {
        // Вставляем на позицию первого блока
        resultLines.splice(firstReviewsIndex, 0, ...newBlockLines);
    } else {
        // Блоков reviews не было, добавляем в конец
        // Не добавляем пустую строку перед блоком reviews
        resultLines.push(...newBlockLines);
    }

    return resultLines.join("\n");
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
    const isDue = isCardDue(card, plugin.settings);

    if (!isDue) {
        const minutesSinceLastReview = getMinutesSinceLastReview(card);
        const minInterval = plugin.settings.minimum_review_interval_minutes;

        if (minutesSinceLastReview >= minInterval) {
            console.debug(
                `Карточка не по графику, но разрешено досрочное повторение (прошло ${minutesSinceLastReview} минут, минимум ${minInterval})`,
            );
        } else {
            const remainingMinutes = minInterval - minutesSinceLastReview;
            const state = computeCardState(card, plugin.settings);
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

    const modal = new ReviewModal(
        app,
        card,
        plugin.settings.customButtonLabels,
    );
    const rating = await modal.show();

    if (!rating) {
        showNotice("notices.review_cancelled");
        return null;
    }

    console.debug("Выбранная оценка:", rating);

    const updatedCard = addReviewSession(card, rating, plugin.settings);
    console.debug("Обновленная карточка:", updatedCard);

    const updatedYaml = getCardYamlAfterReview(card, rating, plugin.settings);
    const updatedFrontmatter = replaceReviewsInFrontmatter(
        frontmatter,
        updatedYaml,
    );

    // Атомарная запись через process — используем свежее содержимое файла
    await app.vault.process(file, (data) => {
        const match = extractFrontmatterWithMatch(data);
        if (!match) return data;

        const before = data.substring(0, match.match.index);
        const after = data.substring(match.match.index + match.match[0].length);
        return before + "---\n" + updatedFrontmatter + "\n---" + after;
    });

    const nextDates = getNextReviewDates(updatedCard, plugin.settings);
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
