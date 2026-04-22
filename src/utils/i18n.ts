import en from "../locales/en.json";
import ru from "../locales/ru.json";

interface TranslationObject {
    [key: string]: string | TranslationObject;
}

class I18n {
    private currentLocale: string;
    private translations: TranslationObject;

    constructor() {
        // Пока язык по умолчанию – английский (позже добавим настройку)
        this.currentLocale = "en";
        this.loadTranslations();
    }

    private loadTranslations() {
        if (this.currentLocale === "ru") {
            this.translations = ru;
        } else {
            this.translations = en;
        }
    }

    public setLocale(locale: "en" | "ru") {
        this.currentLocale = locale;
        this.loadTranslations();
    }

    public getLocale(): string {
        return this.currentLocale;
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
