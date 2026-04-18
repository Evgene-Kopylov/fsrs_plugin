import { Setting } from "obsidian";
import type MyPlugin from "../../main";

/**
 * Рендерит группу параметров алгоритма FSRS.
 * Включает настройки: request_retention, maximum_interval, enable_fuzz.
 */
export function renderFsrsParameters(
	containerEl: HTMLElement,
	plugin: MyPlugin,
): void {
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
				.setValue(plugin.settings.parameters.request_retention)
				.setDynamicTooltip()
				.onChange(async (value) => {
					plugin.settings.parameters.request_retention = value;
					await plugin.saveSettings();
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
		.setName("Enable interval fuzz")
		.setDesc(
			"Add random variation to intervals (±5%) to prevent card grouping.",
		)
		.addToggle((toggle) =>
			toggle
				.setValue(plugin.settings.parameters.enable_fuzz)
				.onChange(async (value) => {
					plugin.settings.parameters.enable_fuzz = value;
					await plugin.saveSettings();
				}),
		);
}
