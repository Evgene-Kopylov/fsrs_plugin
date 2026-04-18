import { Setting } from "obsidian";
import type MyPlugin from "../../main";

/**
 * Рендерит группу настроек по умолчанию для новых карточек.
 * Включает настройки: default_initial_stability, default_initial_difficulty.
 */
export function renderCardDefaults(
	containerEl: HTMLElement,
	plugin: MyPlugin,
): void {
	// Настройки по умолчанию для новых карточек
	new Setting(containerEl).setName("New card defaults").setHeading();

	// default_initial_stability
	new Setting(containerEl)
		.setName("Initial stability")
		.setDesc("Default stability value for new cards.")
		.addText((text) =>
			text
				.setPlaceholder("0.0")
				.setValue(plugin.settings.default_initial_stability.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num)) {
						plugin.settings.default_initial_stability = num;
						await plugin.saveSettings();
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
				.setValue(String(plugin.settings.default_initial_difficulty))
				.onChange(async (value) => {
					const numValue = parseFloat(value);
					if (!isNaN(numValue)) {
						plugin.settings.default_initial_difficulty = numValue;
						await plugin.saveSettings();
					}
				}),
		);
}
