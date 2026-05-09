import { Setting, TextComponent, ColorComponent } from "obsidian";
import type MyPlugin from "../../main";
import {
    FALLBACK_ACCENT_COLOR,
    FALLBACK_BUTTON_COLOR,
    OBSIDIAN_ACCENT_VAR,
} from "../../constants";
import { i18n } from "../../utils/i18n";
import { setVerboseLoggingEnabled } from "../../utils/logger";
import { DEFAULT_SETTINGS } from "../types";

const BODY_CLASS = "fsrs-hide-frontmatter";

/** Включает/выключает CSS-скрытие фронтматтера в попапах */
export function setBodyHideFrontmatter(on: boolean): void {
    activeDocument.body.classList.toggle(BODY_CLASS, on);
}

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

    // hide_frontmatter_in_preview
    const hideFmSetting = new Setting(containerEl)
        .setName(i18n.t("settings.display.hide_frontmatter.name"))
        .setDesc(i18n.t("settings.display.hide_frontmatter.desc"));

    let hideFmToggle: import("obsidian").ToggleComponent;
    hideFmSetting.addToggle((toggle) => {
        hideFmToggle = toggle;
        toggle
            .setValue(plugin.settings.hide_frontmatter_in_preview)
            .onChange(async (value) => {
                plugin.settings.hide_frontmatter_in_preview = value;
                setBodyHideFrontmatter(value);
                await plugin.saveSettings();
            });
    });

    hideFmSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.hide_frontmatter_in_preview =
                    DEFAULT_SETTINGS.hide_frontmatter_in_preview;
                hideFmToggle.setValue(
                    DEFAULT_SETTINGS.hide_frontmatter_in_preview,
                );
                setBodyHideFrontmatter(
                    DEFAULT_SETTINGS.hide_frontmatter_in_preview,
                );
                await plugin.saveSettings();
            });
    });

    // heatmap_target_count + heatmap_color
    const heatmapSetting = new Setting(containerEl)
        .setName(i18n.t("settings.display.heatmap_target.name"))
        .setDesc(i18n.t("settings.display.heatmap_target.desc"));

    let heatmapTargetSlider: import("obsidian").SliderComponent;
    heatmapSetting.addSlider((slider) => {
        heatmapTargetSlider = slider;
        slider
            .setLimits(1, 100, 1)
            .setValue(plugin.settings.heatmap_target_count)
            .setDynamicTooltip()
            .onChange(async (value) => {
                plugin.settings.heatmap_target_count = value;
                plugin.notifyFsrsTableRenderers();
                await plugin.saveSettings();
            });

        // Нативный input для реалтайм-обновления при движении ползунка
        const range = heatmapSetting.settingEl.querySelector(
            'input[type="range"]',
        );
        if (range) {
            range.addEventListener("input", () => {
                plugin.settings.heatmap_target_count = Number(
                    (range as HTMLInputElement).value,
                );
                plugin.notifyFsrsTableRenderers();
            });
        }
    });

    // Акцентный цвет Obsidian: создаём элемент, чтобы дать браузеру
    // вычислить var(--interactive-accent), и конвертируем в hex.
    const rgbToHex = (rgb: string): string => {
        const m = rgb.match(/\d+/g);
        if (!m || m.length < 3) return FALLBACK_ACCENT_COLOR;
        return (
            "#" +
            m
                .slice(0, 3)
                .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
                .join("")
        );
    };

    // Пробный элемент, чтобы браузер вычислил var(--interactive-accent) в
    // конкретный цвет.
    const accentProbe = containerEl.createDiv();
    accentProbe.setAttribute("style", `color: ${OBSIDIAN_ACCENT_VAR}`);
    const accentColor = rgbToHex(
        getComputedStyle(accentProbe).color || FALLBACK_ACCENT_COLOR,
    );
    accentProbe.remove();

    let heatmapColorPicker: import("obsidian").ColorComponent;
    heatmapSetting.addColorPicker((color) => {
        heatmapColorPicker = color;
        color
            .setValue(plugin.settings.heatmap_color || accentColor)
            .onChange(async (value) => {
                // Если цвет совпадает с акцентным — стираем (пустая строка → accent)
                plugin.settings.heatmap_color =
                    value === accentColor ? "" : value;
                await plugin.saveSettings();
                plugin.notifyFsrsTableRenderers();
            });
    });

    heatmapSetting.addExtraButton((btn) => {
        btn.setIcon("reset")
            .setTooltip("Сбросить")
            .onClick(async () => {
                plugin.settings.heatmap_target_count =
                    DEFAULT_SETTINGS.heatmap_target_count;
                heatmapTargetSlider.setValue(
                    DEFAULT_SETTINGS.heatmap_target_count,
                );
                plugin.settings.heatmap_color = "";
                heatmapColorPicker.setValue(accentColor);
                await plugin.saveSettings();
                plugin.notifyFsrsTableRenderers();
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
                .trim() || FALLBACK_BUTTON_COLOR;

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
