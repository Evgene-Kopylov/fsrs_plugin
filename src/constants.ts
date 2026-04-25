import type { FSRSParameters, FSRSSettings } from "./interfaces/fsrs";

// Параметры алгоритма FSRS по умолчанию (совместимые с rs-fsrs)
export const DEFAULT_PARAMETERS: FSRSParameters = {
    request_retention: 0.92, // целевой уровень запоминания 92%
    maximum_interval: 36500, // максимальный интервал 100 лет
    enable_fuzz: true, // включить случайное изменение интервалов
};

// Настройки плагина по умолчанию
export const DEFAULT_SETTINGS: FSRSSettings = {
    // Параметры алгоритма FSRS
    parameters: DEFAULT_PARAMETERS,

    // Настройки по умолчанию для новых карточек
    default_initial_stability: 0.0,
    default_initial_difficulty: 0.0,

    // Настройка для автоматического добавления кнопки повторения
    auto_add_review_button: false,

    // Минимальный интервал для досрочного повторения
    minimum_review_interval_minutes: 40,

    // Паттерны игнорирования файлов и папок
    ignore_patterns: [],
    status_bar_icon: "🔄",
};

// Паттерны игнорирования файлов и папок по умолчанию
export const DEFAULT_IGNORE_PATTERNS = [
    // eslint-disable-next-line obsidianmd/hardcoded-config-path
    ".obsidian/",
    "templates/",
    "attachments/",
    "media/",
    "images/",
    "_trash/",
    ".trash/",
    "*.canvas",
    "*.excalidraw.md",
];

/** Порог переключения часов → дни: <= порога — часы, > порога — дни */
export const OVERDUE_HOURS_THRESHOLD = 72;
