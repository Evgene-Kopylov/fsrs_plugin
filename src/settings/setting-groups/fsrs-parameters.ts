import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";
import { DEFAULT_SETTINGS } from "../types";

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
    const requestRetentionSetting = new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.request_retention.name"))
        .setDesc(i18n.t("settings.fsrs_algorithm.request_retention.desc"));

    let requestRetentionSlider: import("obsidian").SliderComponent;
    requestRetentionSetting.addSlider((slider) => {
        requestRetentionSlider = slider;
        slider
            .setLimits(0.5, 1.0, 0.001)
            .setValue(plugin.settings.parameters.request_retention)
            .setDynamicTooltip()
            .onChange(async (value) => {
                plugin.settings.parameters.request_retention = value;
                await plugin.saveSettings();
            });
    });

    requestRetentionSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.parameters.request_retention =
                    DEFAULT_SETTINGS.parameters.request_retention;
                requestRetentionSlider.setValue(
                    DEFAULT_SETTINGS.parameters.request_retention,
                );
                await plugin.saveSettings();
            });
    });

    // Параметр maximum_interval
    const maxIntervalSetting = new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.maximum_interval.name"))
        .setDesc(i18n.t("settings.fsrs_algorithm.maximum_interval.desc"));

    let maxIntervalText: import("obsidian").TextComponent;
    maxIntervalSetting.addText((text) => {
        maxIntervalText = text;
        text.setPlaceholder("36500")
            .setValue(plugin.settings.parameters.maximum_interval.toString())
            .onChange(async (value) => {
                const num = parseInt(value);
                if (!isNaN(num) && num > 0) {
                    plugin.settings.parameters.maximum_interval = num;
                    await plugin.saveSettings();
                }
            });
    });

    maxIntervalSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.parameters.maximum_interval =
                    DEFAULT_SETTINGS.parameters.maximum_interval;
                maxIntervalText.setValue(
                    DEFAULT_SETTINGS.parameters.maximum_interval.toString(),
                );
                await plugin.saveSettings();
            });
    });

    // Параметр enable_fuzz
    const enableFuzzSetting = new Setting(containerEl)
        .setName(i18n.t("settings.fsrs_algorithm.enable_fuzz.name"))
        .setDesc(i18n.t("settings.fsrs_algorithm.enable_fuzz.desc"));

    let enableFuzzToggle: import("obsidian").ToggleComponent;
    enableFuzzSetting.addToggle((toggle) => {
        enableFuzzToggle = toggle;
        toggle
            .setValue(plugin.settings.parameters.enable_fuzz)
            .onChange(async (value) => {
                plugin.settings.parameters.enable_fuzz = value;
                await plugin.saveSettings();
            });
    });

    enableFuzzSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.parameters.enable_fuzz =
                    DEFAULT_SETTINGS.parameters.enable_fuzz;
                enableFuzzToggle.setValue(
                    DEFAULT_SETTINGS.parameters.enable_fuzz,
                );
                await plugin.saveSettings();
            });
    });
}
