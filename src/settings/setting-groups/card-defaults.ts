import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";
import { DEFAULT_SETTINGS } from "../types";

/**
 * Рендерит группу настроек по умолчанию для новых карточек.
 * Включает настройки: default_initial_stability, default_initial_difficulty.
 */
export function renderCardDefaults(
    containerEl: HTMLElement,
    plugin: MyPlugin,
): void {
    // Настройки по умолчанию для новых карточек
    new Setting(containerEl)
        .setName(i18n.t("settings.card_defaults.heading"))
        .setHeading();

    // default_initial_stability
    const stabilitySetting = new Setting(containerEl)
        .setName(i18n.t("settings.card_defaults.initial_stability.name"))
        .setDesc(i18n.t("settings.card_defaults.initial_stability.desc"));

    let stabilityText: import("obsidian").TextComponent;
    stabilitySetting.addText((text) => {
        stabilityText = text;
        text.setPlaceholder(
            i18n.t("settings.card_defaults.initial_stability.placeholder"),
        )
            .setValue(plugin.settings.default_initial_stability.toString())
            .onChange(async (value) => {
                const num = parseFloat(value);
                if (!isNaN(num)) {
                    plugin.settings.default_initial_stability = num;
                    await plugin.saveSettings();
                }
            });
    });

    stabilitySetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.default_initial_stability =
                    DEFAULT_SETTINGS.default_initial_stability;
                stabilityText.setValue(
                    DEFAULT_SETTINGS.default_initial_stability.toString(),
                );
                await plugin.saveSettings();
            });
    });

    // default_initial_difficulty
    const difficultySetting = new Setting(containerEl)
        .setName(i18n.t("settings.card_defaults.initial_difficulty.name"))
        .setDesc(i18n.t("settings.card_defaults.initial_difficulty.desc"));

    let difficultyText: import("obsidian").TextComponent;
    difficultySetting.addText((text) => {
        difficultyText = text;
        text.setPlaceholder(
            i18n.t("settings.card_defaults.initial_difficulty.placeholder"),
        )
            .setValue(String(plugin.settings.default_initial_difficulty))
            .onChange(async (value) => {
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    plugin.settings.default_initial_difficulty = numValue;
                    await plugin.saveSettings();
                }
            });
    });

    difficultySetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.default_initial_difficulty =
                    DEFAULT_SETTINGS.default_initial_difficulty;
                difficultyText.setValue(
                    DEFAULT_SETTINGS.default_initial_difficulty.toString(),
                );
                await plugin.saveSettings();
            });
    });
}
