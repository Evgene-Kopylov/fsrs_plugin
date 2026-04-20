import { Setting } from "obsidian";
import type MyPlugin from "../../main";

/**
 * Рендерит группу настроек отображения.
 * Включает настройки: auto_add_review_button.
 */
export function renderDisplaySettings(
	containerEl: HTMLElement,
	plugin: MyPlugin,
): void {
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
				.setValue(plugin.settings.auto_add_review_button)
				.onChange(async (value) => {
					plugin.settings.auto_add_review_button = value;
					await plugin.saveSettings();
				}),
		);

	// status_bar_icon
	new Setting(containerEl)
		.setName("Status bar icon")
		.setDesc("Emoji or icon shown in status bar (e.g., 🔄, 📚, ⏰).")
		.addText((text) =>
			text
				.setPlaceholder("🔄")
				.setValue(plugin.settings.status_bar_icon)
				.onChange(async (value) => {
					plugin.settings.status_bar_icon = value.trim() || "🔄";
					await plugin.saveSettings();
					// Обновить статус-бар
					plugin.statusBarManager?.updateStatusBar();
				}),
		);
}
