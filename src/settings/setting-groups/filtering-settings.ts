import { Setting } from "obsidian";
import type MyPlugin from "../../main";
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
	new Setting(containerEl).setName("File filtering").setHeading();

	new Setting(containerEl)
		.setName("Ignore patterns")
		.setDesc(
			"File and folder patterns to ignore (one per line). Patterns ending with / are folders. *.extension for file types. Example: config/, templates/, *.excalidraw.md",
		)
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
