import { Setting } from "obsidian";
import { i18n } from "../../utils/i18n";

/**
 * Рендерит группу настроек досрочного повторения.
 */
export function renderEarlyReviewSettings(containerEl: HTMLElement): void {
    // Заголовок секции
    new Setting(containerEl)
        .setName(i18n.t("settings.early_review.heading"))
        .setHeading();
}
