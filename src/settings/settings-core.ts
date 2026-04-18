import { App, PluginSettingTab } from "obsidian";
import type MyPlugin from "../main";
import { renderFsrsParameters } from "./setting-groups/fsrs-parameters";
import { renderCardDefaults } from "./setting-groups/card-defaults";
import { renderDisplaySettings } from "./setting-groups/display-settings";
import { renderEarlyReviewSettings } from "./setting-groups/early-review-settings";
import { renderFilteringSettings } from "./setting-groups/filtering-settings";

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
		const configDir = this.plugin.app.vault.configDir;

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

		// Рендеринг настроек досрочного повторения
		renderEarlyReviewSettings(containerEl, this.plugin);

		// Разделитель
		containerEl.createEl("hr");

		// Рендеринг настроек фильтрации файлов
		renderFilteringSettings(containerEl, this.plugin, configDir);
	}
}
