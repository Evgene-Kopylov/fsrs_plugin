import type { FSRSSettings } from "../interfaces/fsrs";
import { DEFAULT_SETTINGS as DEFAULT_SETTINGS_FROM_CONSTANTS } from "../constants";

export interface FsrsPluginSettings extends FSRSSettings {
    language: "en" | "ru";
}

// Реэкспорт констант из модуля constants с правильным типом
export const DEFAULT_SETTINGS: FsrsPluginSettings = {
    ...(DEFAULT_SETTINGS_FROM_CONSTANTS as FsrsPluginSettings),
    language: "en",
};
