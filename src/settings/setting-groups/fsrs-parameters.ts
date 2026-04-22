import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";

/**
 * Рендерит группу параметров алгоритма FSRS.
 * Включает настройки: request_retention, maximum_interval, enable_fuzz.
 */
export function renderFsrsParameters(
    containerEl: HTMLElement,
    plugin: MyPlugin,
): void {
    // Заголовок раздела FSRS
    new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.heading"))
        .setHeading();

    // Параметр request_retention
    new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.request_retention.name"))
        .setDesc(i18n.t("settings.fsrs_algorithm.request_retention.desc"))
        .addSlider((slider) =>
            slider
                .setLimits(0.5, 1.0, 0.001)
                .setValue(plugin.settings.parameters.request_retention)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    plugin.settings.parameters.request_retention = value;
                    await plugin.saveSettings();
                }),
        );

    // Параметр maximum_interval
    new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.maximum_interval.name"))
        .setDesc(i18n.t("settings.fsrs_algorithm.maximum_interval.desc"))
        .addText((text) =>
            text
                .setPlaceholder("36500")
                .setValue(
                    plugin.settings.parameters.maximum_interval.toString(),
                )
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) {
                        plugin.settings.parameters.maximum_interval = num;
                        await plugin.saveSettings();
                    }
                }),
        );

    // Параметр enable_fuzz
    new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.enable_fuzz.name"))
        .setDesc(i18n.t("settings.fsrs_algorithm.enable_fuzz.desc"))
        .addToggle((toggle) =>
            toggle
                .setValue(plugin.settings.parameters.enable_fuzz)
                .onChange(async (value) => {
                    plugin.settings.parameters.enable_fuzz = value;
                    await plugin.saveSettings();
                }),
        );
}
