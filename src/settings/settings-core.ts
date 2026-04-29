import { App, PluginSettingTab, Setting } from "obsidian";
import type MyPlugin from "../main";
import { renderFsrsParameters } from "./setting-groups/fsrs-parameters";
import { renderCardDefaults } from "./setting-groups/card-defaults";
import { renderDisplaySettings } from "./setting-groups/display-settings";
import { renderFilteringSettings } from "./setting-groups/filtering-settings";
import { i18n } from "../utils/i18n";
import { updateCommandNames } from "../commands/index";

/**
 * Основной класс вкладки настроек FSRS плагина.
 * Координирует рендеринг различных групп настроек.
 */
export class FsrsSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Рендеринг раздела выбора языка (наверху)
        new Setting(containerEl)
            .setName(i18n.t("settings.language.heading"))
            .setHeading();

        new Setting(containerEl)
            .setName(i18n.t("settings.language.heading"))
            .setDesc(i18n.t("settings.language.desc"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("system", i18n.t("settings.language.system"))
                    .addOption("en", i18n.t("settings.language.en"))
                    .addOption("ru", i18n.t("settings.language.ru"))
                    .setValue(this.plugin.settings.language || "system")
                    .onChange(async (value: "system" | "en" | "ru") => {
                        this.plugin.settings.language = value;
                        await this.plugin.saveSettings();
                        if (value === "system") {
                            i18n.setLocale(i18n.resolveLocale("system"));
                        } else {
                            i18n.setLocale(value);
                        }
                        updateCommandNames(this.plugin.app);
                        // Перерисовать вкладку настроек для применения нового языка
                        this.display();
                    });
            });

        // Разделитель
        containerEl.createEl("hr");

        // Рендеринг группы параметров алгоритма FSRS
        renderFsrsParameters(containerEl, this.plugin);

        // Разделитель
        containerEl.createEl("hr");

        // Рендеринг настроек по умолчанию для новых карточек
        renderCardDefaults(containerEl, this.plugin);

        // Разделитель
        containerEl.createEl("hr");

        // Рендеринг настроек отображения
        renderDisplaySettings(containerEl, this.plugin);

        // Разделитель
        containerEl.createEl("hr");

        // Рендеринг настроек фильтрации файлов
        renderFilteringSettings(containerEl, this.plugin);
    }
}
