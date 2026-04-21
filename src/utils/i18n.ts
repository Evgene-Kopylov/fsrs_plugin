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

    public t(key: string, params?: Record<string, string | number>): string {
        const keys = key.split(".");
        let value: unknown = this.translations;
        for (const k of keys) {
            if (value && typeof value === "object" && k in value) {
                value = (value as TranslationObject)[k];
            } else {
                console.warn(`Missing translation key: ${key}`);
                return key;
            }
        }
        if (typeof value !== "string") {
            return key;
        }
        if (params) {
            return value.replace(/\{(\w+)\}/g, (_, param) => {
                const key = param as keyof typeof params;
                return key in params ? String(params[key]) : `{${param}}`;
            });
        }
        return value;
    }
}

export const i18n = new I18n();
