import type { FSRSSettings } from "../interfaces/fsrs";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS_FROM_CONSTANTS } from "../constants";

export interface FsrsPluginSettings extends FSRSSettings {
    language: "system" | "en" | "ru" | "zh";
    verbose_logging: boolean;
    hide_frontmatter_in_preview: boolean;
    customButtonLabels?: {
        again: string;
        hard: string;
        good: string;
        easy: string;
    };
    customButtonColors?: {
        again: string;
        hard: string;
        good: string;
        easy: string;
    };
}

// Реэкспорт констант из модуля constants с правильным типом
export const DEFAULT_SETTINGS: FsrsPluginSettings = {
    ...(DEFAULT_SETTINGS_FROM_CONSTANTS as FsrsPluginSettings),
    language: "system",
    verbose_logging: false,
    hide_frontmatter_in_preview: true,
    customButtonLabels: {
        again: "",
        hard: "",
        good: "",
        easy: "",
    },
    customButtonColors: {
        again: "",
        hard: "",
        good: "",
        easy: "",
    },
};
