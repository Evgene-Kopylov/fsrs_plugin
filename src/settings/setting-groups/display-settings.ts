import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";
import { setVerboseLoggingEnabled } from "../../utils/logger";

/**
 * Рендерит группу настроек отображения.
 * Включает настройки: auto_add_review_button, status_bar_icon, verbose_logging.
 */
export function renderDisplaySettings(
    containerEl: HTMLElement,
    plugin: MyPlugin,
): void {
    // Настройки отображения
    new Setting(containerEl)
        .setName(i18n.t("settings.display.heading"))
        .setHeading();

    // auto_add_review_button
    new Setting(containerEl)
        .setName(i18n.t("settings.display.auto_add_button.name"))
        .setDesc(i18n.t("settings.display.auto_add_button.desc"))
        .addToggle((toggle) =>
            toggle
                .setValue(plugin.settings.auto_add_review_button)
                .onChange(async (value) => {
                    plugin.settings.auto_add_review_button = value;
                    await plugin.saveSettings();
                }),
        );

    // status_bar_icon
    new Setting(containerEl)
        .setName(i18n.t("settings.display.status_bar_icon.name"))
        .setDesc(i18n.t("settings.display.status_bar_icon.desc"))
        .addText((text) =>
            text
                .setPlaceholder(
                    i18n.t("settings.display.status_bar_icon.placeholder"),
                )
                .setValue(plugin.settings.status_bar_icon)
                .onChange(async (value) => {
                    plugin.settings.status_bar_icon = value.trim() || "🔄";
                    await plugin.saveSettings();
                    // Обновить статус-бар
                    void plugin.statusBarManager?.updateStatusBar();
                }),
        );

    // verbose_logging
    new Setting(containerEl)
        .setName(i18n.t("settings.display.verbose_logging.name"))
        .setDesc(i18n.t("settings.display.verbose_logging.desc"))
        .addToggle((toggle) =>
            toggle
                .setValue(plugin.settings.verbose_logging)
                .onChange(async (value) => {
                    plugin.settings.verbose_logging = value;
                    setVerboseLoggingEnabled(value);
                    await plugin.saveSettings();
                }),
        );

    // custom_button_labels
    new Setting(containerEl)
        .setName(i18n.t("settings.display.custom_button_labels.name"))
        .setDesc(i18n.t("settings.display.custom_button_labels.desc"))
        .setHeading();

    const labelsContainer = containerEl.createEl("div");
    labelsContainer.classList.add("fsrs-labels-container");

    const buttonKeys: ("again" | "hard" | "good" | "easy")[] = [
        "again",
        "hard",
        "good",
        "easy",
    ];

    buttonKeys.forEach((key) => {
        new Setting(labelsContainer)
            .setName(i18n.t(`settings.display.custom_button_labels.${key}`))
            .addText((text) =>
                text
                    .setPlaceholder(
                        i18n.t(
                            `settings.display.custom_button_labels.placeholder_${key}`,
                        ),
                    )
                    .setValue(plugin.settings.customButtonLabels?.[key] ?? "")
                    .onChange(async (value) => {
                        if (!plugin.settings.customButtonLabels) {
                            plugin.settings.customButtonLabels = {
                                again: "",
                                hard: "",
                                good: "",
                                easy: "",
                            };
                        }
                        plugin.settings.customButtonLabels[key] = value;
                        await plugin.saveSettings();
                    }),
            );
    });
}
