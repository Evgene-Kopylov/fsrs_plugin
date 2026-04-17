import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import type { FSRSSettings, FSRSParameters } from "./interfaces/fsrs";
import {
	formatIgnorePatterns,
	parseIgnorePatterns,
} from "./utils/fsrs/fsrs-filter";
import {
	DEFAULT_PARAMETERS,
	DEFAULT_SETTINGS as DEFAULT_SETTINGS_FROM_CONSTANTS,
} from "./constants";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FsrsPluginSettings extends FSRSSettings {}

// Реэкспорт констант из модуля constants с правильным типом
export const DEFAULT_SETTINGS: FsrsPluginSettings =
	DEFAULT_SETTINGS_FROM_CONSTANTS as FsrsPluginSettings;

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

		// Заголовок раздела FSRS
		new Setting(containerEl).setName("FSRS Algorithm").setHeading(); // eslint-disable-line obsidianmd/ui/sentence-case

		// Параметр request_retention
		new Setting(containerEl)
			.setName("Request retention")
			.setDesc(
				"Target retention rate (0.0-1.0). Higher = more reviews, lower retention.",
			)
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 1.0, 0.001)
					.setValue(this.plugin.settings.parameters.request_retention)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.parameters.request_retention =
							value;
						await this.plugin.saveSettings();
					}),
			);

		// Параметр maximum_interval
		new Setting(containerEl)
			.setName("Maximum interval")
			.setDesc("Maximum days between reviews. 36500 = ~100 years.")
			.addText((text) =>
				text
					.setPlaceholder("36500")
					.setValue(
						this.plugin.settings.parameters.maximum_interval.toString(),
					)
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.parameters.maximum_interval =
								num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// Параметр enable_fuzz
		new Setting(containerEl)
			.setName("Enable interval fuzz")
			.setDesc(
				"Add random variation to intervals (±5%) to prevent card grouping.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.parameters.enable_fuzz)
					.onChange(async (value) => {
						this.plugin.settings.parameters.enable_fuzz = value;
						await this.plugin.saveSettings();
					}),
			);

		// Разделитель
		containerEl.createEl("hr");

		// Настройки по умолчанию для новых карточек
		new Setting(containerEl).setName("New card defaults").setHeading();

		// default_initial_stability
		new Setting(containerEl)
			.setName("Initial stability")
			.setDesc("Default stability value for new cards.")
			.addText((text) =>
				text
					.setPlaceholder("0.0")
					.setValue(
						this.plugin.settings.default_initial_stability.toString(),
					)
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num)) {
							this.plugin.settings.default_initial_stability =
								num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// default_initial_difficulty
		new Setting(containerEl)
			.setName("Initial difficulty")
			.setDesc("Default difficulty value for new cards.")
			.addText((text) =>
				text
					.setPlaceholder("0.0")
					.setValue(
						String(this.plugin.settings.default_initial_difficulty),
					)
					.onChange(async (value) => {
						const numValue = parseFloat(value);
						if (!isNaN(numValue)) {
							this.plugin.settings.default_initial_difficulty =
								numValue;
							await this.plugin.saveSettings();
						}
					}),
			);

		// Разделитель
		containerEl.createEl("hr");

		// Настройки отображения
		new Setting(containerEl).setName("Display").setHeading();

		// auto_add_review_button
		new Setting(containerEl)
			.setName("Auto add review button")
			.setDesc(
				"Automatically insert review button block after frontmatter when adding FSRS fields.", // eslint-disable-line obsidianmd/ui/sentence-case
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.auto_add_review_button)
					.onChange(async (value) => {
						this.plugin.settings.auto_add_review_button = value;
						await this.plugin.saveSettings();
					}),
			);

		// Интервал для досрочного повторения
		new Setting(containerEl).setName("Early review").setHeading();

		// minimum_review_interval_minutes
		new Setting(containerEl)
			.setName("Minimum early review interval")
			.setDesc(
				"Minimum minutes before a card can be reviewed early. Set to 0 to allow immediate review.",
			)
			.addText((text) =>
				text
					.setPlaceholder("40")
					.setValue(
						this.plugin.settings.minimum_review_interval_minutes.toString(),
					)
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.minimum_review_interval_minutes =
								num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// Разделитель
		containerEl.createEl("hr");

		// Настройки фильтрации файлов
		new Setting(containerEl).setName("File filtering").setHeading();

		new Setting(containerEl)
			.setName("Ignore patterns")
			.setDesc(
				"File and folder patterns to ignore (one per line). Patterns ending with / are folders. *.extension for file types. Example: config/, templates/, *.excalidraw.md",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						`${configDir}/\ntemplates/\n*.excalidraw.md`,
					)
					.setValue(
						formatIgnorePatterns(
							this.plugin.settings.ignore_patterns,
						),
					)
					.onChange(async (value) => {
						const patterns = parseIgnorePatterns(value);
						this.plugin.settings.ignore_patterns = patterns;
						await this.plugin.saveSettings();
					}),
			);
	}
}
