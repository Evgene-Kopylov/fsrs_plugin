import { Setting } from "obsidian";
import type MyPlugin from "../../main";

/**
 * Рендерит группу настроек досрочного повторения.
 * Включает настройки: minimum_review_interval_minutes.
 */
export function renderEarlyReviewSettings(
	containerEl: HTMLElement,
	plugin: MyPlugin,
): void {
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
					plugin.settings.minimum_review_interval_minutes.toString(),
				)
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0) {
						plugin.settings.minimum_review_interval_minutes = num;
						await plugin.saveSettings();
					}
				}),
		);
}
