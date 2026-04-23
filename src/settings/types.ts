import type { FSRSSettings } from "../interfaces/fsrs";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS_FROM_CONSTANTS } from "../constants";

export interface FsrsPluginSettings extends FSRSSettings {
    language: "system" | "en" | "ru";
    verbose_logging: boolean;
    customButtonLabels?: {
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
    customButtonLabels: {
        again: "",
        hard: "",
        good: "",
        easy: "",
    },
};
