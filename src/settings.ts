import { App, PluginSettingTab, Setting } from "obsidian";
import MyPlugin from "./main";
import type { FSRSSettings, FSRSParameters } from "./interfaces/fsrs";
import {
	formatIgnorePatterns,
	parseIgnorePatterns,
} from "./utils/fsrs/fsrs-filter";

// Расширяем базовые настройки плагина параметрами FSRS
export interface MyPluginSettings extends FSRSSettings {
	// Базовое поле для обратной совместимости
	mySetting: string;
}

// Параметры алгоритма FSRS по умолчанию (совместимые с rs-fsrs)
const DEFAULT_PARAMETERS: FSRSParameters = {
	request_retention: 0.9, // целевой уровень запоминания 90%
	maximum_interval: 36500, // максимальный интервал 100 лет
	enable_fuzz: true, // включить случайное изменение интервалов
};

export const DEFAULT_SETTINGS: MyPluginSettings = {
	// Параметры алгоритма FSRS
	parameters: DEFAULT_PARAMETERS,

	// Настройки по умолчанию для новых карточек
	default_initial_stability: 0.0,
	default_initial_difficulty: 0.0,

	// Настройки отображения
	show_stability: true,
	show_difficulty: true,
	show_retrievability: true,
	show_advanced_stats: false,
	max_cards_to_show: 30,
	auto_add_review_button: true,

	// Настройки обновления
	auto_refresh: true,
	refresh_interval: 5, // 5 минут
	minimum_review_interval_minutes: 40, // минимальный интервал для досрочного повторения

	// Настройки фильтрации
	filter_by_folders: [],
	filter_by_tags: [],
	exclude_states: [],
	ignore_patterns: [],

	// Настройки уведомлений
	show_notifications: true,
	notification_threshold: 5,

	// Базовое поле для обратной совместимости
	mySetting: "default",
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Заголовок раздела FSRS
		new Setting(containerEl).setName("FSRS Algorithm Settings").setHeading();

		// Параметр request_retention
		new Setting(containerEl)
			.setName("Request Retention")
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
			.setName("Maximum Interval (days)")
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
			.setName("Enable Interval Fuzz")
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
		new Setting(containerEl).setName("New Card Defaults").setHeading();

		// default_initial_stability
		new Setting(containerEl)
			.setName("Initial Stability")
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
			.setName("Initial Difficulty")
			.setDesc("Default difficulty value for new cards.")
			.addText((text) =>
				text
					.setPlaceholder("0.0")
					.setValue(
						this.plugin.settings.default_initial_difficulty.toString(),
					)
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num)) {
							this.plugin.settings.default_initial_difficulty =
								num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// Разделитель
		containerEl.createEl("hr");

		// Настройки отображения
		new Setting(containerEl).setName("Display Settings").setHeading();

		// show_stability
		new Setting(containerEl)
			.setName("Show Stability")
			.setDesc("Display stability values in card lists.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.show_stability)
					.onChange(async (value) => {
						this.plugin.settings.show_stability = value;
						await this.plugin.saveSettings();
					}),
			);

		// show_difficulty
		new Setting(containerEl)
			.setName("Show Difficulty")
			.setDesc("Display difficulty values in card lists.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.show_difficulty)
					.onChange(async (value) => {
						this.plugin.settings.show_difficulty = value;
						await this.plugin.saveSettings();
					}),
			);

		// show_retrievability
		new Setting(containerEl)
			.setName("Show Retrievability")
			.setDesc("Display retrievability (memory strength) values.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.show_retrievability)
					.onChange(async (value) => {
						this.plugin.settings.show_retrievability = value;
						await this.plugin.saveSettings();
					}),
			);

		// show_advanced_stats
		new Setting(containerEl)
			.setName("Show Advanced Statistics")
			.setDesc(
				"Display advanced statistics like elapsed days, reps, lapses.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.show_advanced_stats)
					.onChange(async (value) => {
						this.plugin.settings.show_advanced_stats = value;
						await this.plugin.saveSettings();
					}),
			);

		// max_cards_to_show
		new Setting(containerEl)
			.setName("Max Cards to Show")
			.setDesc(
				"Maximum number of cards to display in lists (0 = unlimited).",
			)
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(this.plugin.settings.max_cards_to_show.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.max_cards_to_show = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// auto_add_review_button
		new Setting(containerEl)
			.setName("Auto Add Review Button")
			.setDesc(
				"Automatically insert review button block after frontmatter when adding FSRS fields.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.auto_add_review_button)
					.onChange(async (value) => {
						this.plugin.settings.auto_add_review_button = value;
						await this.plugin.saveSettings();
					}),
			);

		// Разделитель
		containerEl.createEl("hr");

		// Настройки уведомлений
		new Setting(containerEl).setName("Notification Settings").setHeading();

		// show_notifications
		new Setting(containerEl)
			.setName("Show Notifications")
			.setDesc("Display desktop notifications for due cards.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.show_notifications)
					.onChange(async (value) => {
						this.plugin.settings.show_notifications = value;
						await this.plugin.saveSettings();
					}),
			);

		// notification_threshold
		new Setting(containerEl)
			.setName("Notification Threshold")
			.setDesc("Minimum number of due cards to trigger notification.")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(
						this.plugin.settings.notification_threshold.toString(),
					)
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.notification_threshold = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// Разделитель
		containerEl.createEl("hr");

		// Настройки обновления
		new Setting(containerEl).setName("Refresh Settings").setHeading();

		// auto_refresh
		new Setting(containerEl)
			.setName("Auto Refresh")
			.setDesc("Automatically refresh card lists.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.auto_refresh)
					.onChange(async (value) => {
						this.plugin.settings.auto_refresh = value;
						await this.plugin.saveSettings();
					}),
			);

		// refresh_interval
		new Setting(containerEl)
			.setName("Refresh Interval (minutes)")
			.setDesc("How often to auto-refresh card lists.")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(this.plugin.settings.refresh_interval.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.refresh_interval = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		// minimum_review_interval_minutes
		new Setting(containerEl)
			.setName("Minimum Early Review Interval (minutes)")
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
		new Setting(containerEl).setName("File Filtering").setHeading();

		new Setting(containerEl)
			.setName("Ignore Patterns")
			.setDesc(
				"File and folder patterns to ignore (one per line). Patterns ending with / are folders. *.extension for file types. Example: .obsidian/, templates/, *.excalidraw.md",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(".obsidian/\ntemplates/\n*.excalidraw.md")
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

		// Разделитель
		containerEl.createEl("hr");

		// Старое поле для обратной совместимости
		new Setting(containerEl).setName("Advanced Settings").setHeading();

		new Setting(containerEl)
			.setName("Legacy Setting")
			.setDesc(
				"Compatibility setting. Do not modify unless you know what you're doing.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
