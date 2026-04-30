import { Setting, TextComponent, ColorComponent } from "obsidian";
import type MyPlugin from "../../main";
import { i18n } from "../../utils/i18n";
import { setVerboseLoggingEnabled } from "../../utils/logger";
import { DEFAULT_SETTINGS } from "../types";

/**
 * Рендерит группу настроек отображения.
 * Включает настройки: auto_add_review_button, verbose_logging.
 */
export function renderDisplaySettings(
    containerEl: HTMLElement,
    plugin: MyPlugin,
): void {
    // Настройки отображения
    new Setting(containerEl)
        .setName(i18n.t("settings.display.heading"))
        .setHeading();

    // auto_add_review_button
    const autoAddSetting = new Setting(containerEl)
        .setName(i18n.t("settings.display.auto_add_button.name"))
        .setDesc(i18n.t("settings.display.auto_add_button.desc"));

    let autoAddToggle: import("obsidian").ToggleComponent;
    autoAddSetting.addToggle((toggle) => {
        autoAddToggle = toggle;
        toggle
            .setValue(plugin.settings.auto_add_review_button)
            .onChange(async (value) => {
                plugin.settings.auto_add_review_button = value;
                await plugin.saveSettings();
            });
    });

    autoAddSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.auto_add_review_button =
                    DEFAULT_SETTINGS.auto_add_review_button;
                autoAddToggle.setValue(DEFAULT_SETTINGS.auto_add_review_button);
                await plugin.saveSettings();
            });
    });

    // verbose_logging
    const verboseSetting = new Setting(containerEl)
        .setName(i18n.t("settings.display.verbose_logging.name"))
        .setDesc(i18n.t("settings.display.verbose_logging.desc"));

    let verboseToggle: import("obsidian").ToggleComponent;
    verboseSetting.addToggle((toggle) => {
        verboseToggle = toggle;
        toggle
            .setValue(plugin.settings.verbose_logging)
            .onChange(async (value) => {
                plugin.settings.verbose_logging = value;
                setVerboseLoggingEnabled(value);
                await plugin.saveSettings();
            });
    });

    verboseSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.verbose_logging =
                    DEFAULT_SETTINGS.verbose_logging;
                verboseToggle.setValue(DEFAULT_SETTINGS.verbose_logging);
                setVerboseLoggingEnabled(DEFAULT_SETTINGS.verbose_logging);
                await plugin.saveSettings();
            });
    });

    // custom_button_labels
    new Setting(containerEl)
        .setName(i18n.t("settings.display.custom_button_labels.name"))
        .setDesc(i18n.t("settings.display.custom_button_labels.desc"))
        .setHeading();

    const labelsContainer = containerEl.createDiv();
    labelsContainer.classList.add("fsrs-labels-container");

    const buttonKeys: ("again" | "hard" | "good" | "easy")[] = [
        "again",
        "hard",
        "good",
        "easy",
    ];

    buttonKeys.forEach((key) => {
        const setting = new Setting(labelsContainer).setName(
            i18n.t(`settings.display.custom_button_labels.${key}`),
        );

        // Поле для названия кнопки
        let textComponent: TextComponent;
        setting.addText((text) => {
            textComponent = text;
            text.setPlaceholder(
                i18n.t(
                    `settings.display.custom_button_labels.placeholder_${key}`,
                ),
            )
                .setValue(plugin.settings.customButtonLabels?.[key] ?? "")
                .onChange(async (value) => {
                    if (!plugin.settings.customButtonLabels) {
                        plugin.settings.customButtonLabels = {
                            again: "",
                            hard: "",
                            good: "",
                            easy: "",
                        };
                    }
                    plugin.settings.customButtonLabels[key] = value;
                    await plugin.saveSettings();
                });
        });

        // Поле для цвета кнопки
        const defaultColor =
            getComputedStyle(activeDocument.body)
                .getPropertyValue(`--fsrs-color-${key}`)
                .trim() || "#cccccc";

        let colorComponent: ColorComponent;
        setting.addColorPicker((color) => {
            colorComponent = color;
            color
                .setValue(
                    plugin.settings.customButtonColors?.[key] || defaultColor,
                )
                .onChange(async (value) => {
                    if (!plugin.settings.customButtonColors) {
                        plugin.settings.customButtonColors = {
                            again: "",
                            hard: "",
                            good: "",
                            easy: "",
                        };
                    }
                    // Если цвет совпадает с дефолтным CSS — стираем (пустая строка → CSS-переменная)
                    plugin.settings.customButtonColors[key] =
                        value.toUpperCase() === defaultColor.toUpperCase()
                            ? ""
                            : value;
                    await plugin.saveSettings();
                });
        });

        // Кнопка сброса имени и цвета
        setting.addExtraButton((btn) => {
            btn.setIcon("reset")
                .setTooltip(
                    i18n.t(
                        "settings.display.custom_button_labels.reset_tooltip",
                    ),
                )
                .onClick(async () => {
                    // Сброс имени
                    if (!plugin.settings.customButtonLabels) {
                        plugin.settings.customButtonLabels = {
                            again: "",
                            hard: "",
                            good: "",
                            easy: "",
                        };
                    }
                    plugin.settings.customButtonLabels[key] = "";
                    textComponent.setValue("");

                    // Сброс цвета
                    if (!plugin.settings.customButtonColors) {
                        plugin.settings.customButtonColors = {
                            again: "",
                            hard: "",
                            good: "",
                            easy: "",
                        };
                    }
                    plugin.settings.customButtonColors[key] = "";
                    colorComponent.setValue(defaultColor);

                    await plugin.saveSettings();
                });
        });
    });
}
