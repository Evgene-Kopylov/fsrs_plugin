import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";

/**
 * Рендерит группу настроек отображения.
 * Включает настройки: auto_add_review_button.
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
}
