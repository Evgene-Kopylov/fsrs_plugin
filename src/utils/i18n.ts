import en from "../locales/en.json";
import ru from "../locales/ru.json";
import zh from "../locales/zh.json";

interface TranslationObject {
    [key: string]: string | TranslationObject;
}

class I18n {
    private currentLocale: string;
    private translations: TranslationObject;

    constructor() {
        this.currentLocale = I18n.detectSystemLocale();
        this.loadTranslations();
    }

    /**
     * Определяет язык из настроек Obsidian (moment.locale).
     * Если язык не поддерживается плагином, возвращает "en".
     */
    static detectSystemLocale(): string {
        try {
            const locale = window.moment.locale();
            if (locale === "ru") return "ru";
            if (locale.startsWith("zh")) return "zh";
            return "en";
        } catch {
            return "en";
        }
    }

    private loadTranslations() {
        const resolved = this.resolveLocale(this.currentLocale);
        if (resolved === "ru") {
            this.translations = ru;
        } else if (resolved === "zh") {
            this.translations = zh;
        } else {
            this.translations = en;
        }
    }

    /**
     * Преобразует "system" в реальный код языка.
     * Остальные коды возвращает как есть.
     */
    resolveLocale(locale: string): string {
        if (locale === "system") {
            return I18n.detectSystemLocale();
        }
        return locale;
    }

    public setLocale(locale: string) {
        this.currentLocale = locale;
        this.loadTranslations();
    }

    public getLocale(): string {
        return this.currentLocale;
    }

    /**
     * Возвращает массив доступных языков.
     * Первый элемент — "system" (автоопределение из Obsidian).
     */
    static getAvailableLocales(): string[] {
        return ["system", "en", "ru", "zh"];
    }

    public t(
        key: string,
        params?: Record<string, string | number | undefined>,
    ): string {
        const keys = key.split(".");
        let value: unknown = this.translations;
        for (const k of keys) {
            if (value && typeof value === "object" && k in value) {
                value = (value as TranslationObject)[k];
            } else {
                console.warn(`Missing translation key: ${key}`);
                // Если есть defaultValue в params, возвращаем его
                if (params && params.defaultValue !== undefined) {
                    return String(params.defaultValue);
                }
                return key;
            }
        }
        if (typeof value !== "string") {
            if (params && params.defaultValue !== undefined) {
                return String(params.defaultValue);
            }
            return key;
        }
        if (params) {
            return value.replace(/\{(\w+)\}/g, (_, param) => {
                if (param === "defaultValue") {
                    return `{${param}}`;
                }
                const key = param as keyof typeof params;
                return key in params ? String(params[key]) : `{${param}}`;
            });
        }
        return value;
    }
}

export const i18n = new I18n();

/**
 * Returns the correct noun form for the given number based on current locale.
 * For English: singular for 1, plural for others.
 * For Russian: three forms for different grammatical cases.
 */
export function getLocalizedNoun(
    number: number,
    singular: string,
    plural: string,
    genitive?: string,
): string {
    if (i18n.getLocale() === "ru") {
        // Russian pluralization rules
        const n = Math.abs(number) % 100;
        const n1 = n % 10;
        if (n > 10 && n < 20) {
            return genitive || plural;
        }
        if (n1 === 1) {
            return singular;
        }
        if (n1 >= 2 && n1 <= 4) {
            return plural;
        }
        return genitive || plural;
    } else {
        // English pluralization
        return number === 1 ? singular : plural;
    }
}
