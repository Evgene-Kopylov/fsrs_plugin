import { Notice } from "obsidian";
import { i18n } from "./i18n";

/**
 * Shows an Obsidian notice with a localized message.
 * @param key Translation key for the message
 * @param params Optional interpolation parameters
 */
export function showNotice(
    key: string,
    params?: Record<string, string | number>,
): void {
    new Notice(i18n.t(key, params));
}
