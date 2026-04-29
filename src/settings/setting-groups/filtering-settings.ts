import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";
import {
    formatIgnorePatterns,
    parseIgnorePatterns,
} from "../../utils/fsrs/fsrs-filter";
import { DEFAULT_SETTINGS } from "../types";

/**
 * Рендерит группу настроек фильтрации файлов.
 * Включает настройки: ignore_patterns.
 */
export function renderFilteringSettings(
    containerEl: HTMLElement,
    plugin: MyPlugin,
): void {
    // Настройки фильтрации файлов
    new Setting(containerEl)
        .setName(i18n.t("settings.filtering.heading"))
        .setHeading();

    const ignoreSetting = new Setting(containerEl)
        .setName(i18n.t("settings.filtering.ignore_patterns.name"))
        .setDesc(i18n.t("settings.filtering.ignore_patterns.desc"));

    let ignoreTextArea: import("obsidian").TextAreaComponent;
    ignoreSetting.addTextArea((text) => {
        ignoreTextArea = text;
        text.setPlaceholder(
            `templates/
*.excalidraw.md`,
        )
            .setValue(formatIgnorePatterns(plugin.settings.ignore_patterns))
            .onChange(async (value) => {
                const patterns = parseIgnorePatterns(value);
                plugin.settings.ignore_patterns = patterns;
                await plugin.saveSettings();
            });
    });

    ignoreSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.ignore_patterns =
                    DEFAULT_SETTINGS.ignore_patterns;
                ignoreTextArea.setValue(
                    formatIgnorePatterns(DEFAULT_SETTINGS.ignore_patterns),
                );
                await plugin.saveSettings();
            });
    });
}
