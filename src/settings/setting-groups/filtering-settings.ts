import { Setting } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";
import {
    formatIgnorePatterns,
    parseIgnorePatterns,
} from "../../utils/fsrs/fsrs-filter";

/**
 * Рендерит группу настроек фильтрации файлов.
 * Включает настройки: ignore_patterns.
 */
export function renderFilteringSettings(
    containerEl: HTMLElement,
    plugin: MyPlugin,
    configDir: string,
): void {
    // Настройки фильтрации файлов
    new Setting(containerEl)
        .setName(i18n.t("settings.filtering.heading"))
        .setHeading();

    new Setting(containerEl)
        .setName(i18n.t("settings.filtering.ignore_patterns.name"))
        .setDesc(i18n.t("settings.filtering.ignore_patterns.desc"))
        .addTextArea((text) =>
            text
                .setPlaceholder(`${configDir}/\ntemplates/\n*.excalidraw.md`)
                .setValue(formatIgnorePatterns(plugin.settings.ignore_patterns))
                .onChange(async (value) => {
                    const patterns = parseIgnorePatterns(value);
                    plugin.settings.ignore_patterns = patterns;
                    await plugin.saveSettings();
                }),
        );
}
