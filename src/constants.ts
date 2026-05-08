import type { FSRSParameters, FSRSSettings } from "./interfaces/fsrs";

// Параметры алгоритма FSRS по умолчанию (совместимые с rs-fsrs)
export const DEFAULT_PARAMETERS: FSRSParameters = {
    request_retention: 0.9, // целевой уровень запоминания 90%
    maximum_interval: 36500, // максимальный интервал 100 лет
    enable_fuzz: true, // включить случайное изменение интервалов
};

// Минимальный интервал для досрочного повторения (40 минут)
export const MINIMUM_REVIEW_INTERVAL_MINUTES = 40;

/** CSS-переменная акцентного цвета Obsidian */
export const OBSIDIAN_ACCENT_VAR = "var(--interactive-accent)";

/** Цвет по умолчанию, если акцентный не удалось определить */
export const FALLBACK_ACCENT_COLOR = "#8b5cf6";

/** Цвет кнопки по умолчанию, если CSS-переменная не определена */
export const FALLBACK_BUTTON_COLOR = "#cccccc";

// Настройки плагина по умолчанию
export const DEFAULT_SETTINGS: FSRSSettings = {
    // Параметры алгоритма FSRS
    parameters: DEFAULT_PARAMETERS,

    // Настройки по умолчанию для новых карточек
    default_initial_stability: 0.0,
    default_initial_difficulty: 0.0,

    // Настройка для автоматического добавления кнопки повторения
    auto_add_review_button: true,

    // Целевое число повторений для насыщения цвета тепловой карты
    heatmap_target_count: 30,

    // Кастомный цвет тепловой карты (пусто = accent)
    heatmap_color: "",

    // Паттерны игнорирования файлов и папок
    ignore_patterns: [],
};

/** Максимальное количество строк, отображаемых в таблице, если не указан LIMIT в SQL */
export const DEFAULT_TABLE_DISPLAY_LIMIT = 20;

/** Интервал автообновления таблицы (секунды), пока она видна */
export const TABLE_AUTO_REFRESH_INTERVAL_SECONDS = 300;
