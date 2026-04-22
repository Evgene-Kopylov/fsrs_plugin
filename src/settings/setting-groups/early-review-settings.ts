import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";

/**
 * Рендерит группу настроек досрочного повторения.
 * Включает настройки: minimum_review_interval_minutes.
 */
export function renderEarlyReviewSettings(
    containerEl: HTMLElement,
    plugin: MyPlugin,
): void {
    // Интервал для досрочного повторения
    new Setting(containerEl)
        .setName(i18n.t("settings.early_review.heading"))
        .setHeading();

    // minimum_review_interval_minutes
    new Setting(containerEl)
        .setName(i18n.t("settings.early_review.minimum_interval.name"))
        .setDesc(i18n.t("settings.early_review.minimum_interval.desc"))
        .addText((text) =>
            text
                .setPlaceholder(
                    i18n.t(
                        "settings.early_review.minimum_interval.placeholder",
                    ),
                )
                .setValue(
                    plugin.settings.minimum_review_interval_minutes.toString(),
                )
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num >= 0) {
                        plugin.settings.minimum_review_interval_minutes = num;
                        await plugin.saveSettings();
                    }
                }),
        );
}
