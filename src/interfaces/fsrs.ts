// Интерфейсы для FSRS плагина Obsidian (обновленные для формата с reviews)

// Состояния карточки FSRS
export type FSRSState = "New" | "Learning" | "Review" | "Relearning";

// Оценки для повторения
export type FSRSRating = "Again" | "Hard" | "Good" | "Easy";

// Сессия повторения карточки (хранится в истории)
export interface ReviewSession {
    date: string; // ISO 8601 строка
    rating: FSRSRating;
}

// Современная карточка FSRS (новый формат)
export interface ModernFSRSCard {
    reviews: ReviewSession[]; // история сессий повторения
    filePath: string; // путь к файлу в хранилище Obsidian
}

// Историческое состояние карточки после повторения (возвращается из compute_card_history)
export interface HistoricalState {
    date: string; // ISO 8601 строка
    rating: FSRSRating | null;
    stability: number;
    difficulty: number;
    state: FSRSState;
    elapsed_days: number;
    scheduled_days: number;
    retrievability: number; // после ответа всегда 1.0
    retrievability_before: number | null; // перед ответом
    retrievability_next: number | null; // на момент следующего повторения
}

// Вычисляемое текущее состояние карточки (не хранится, вычисляется)
export interface ComputedCardState {
    due: string; // ISO 8601 строка (следующая дата повторения)
    overdue?: number; // количество часов просрочки (положительное - просрочка)
    stability: number;
    difficulty: number;
    state: FSRSState;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    retrievability: number; // извлекаемость (0.0-1.0)
}

// Карточка с кэшированным состоянием
export interface CachedCard {
    card: ModernFSRSCard;
    state: ComputedCardState;
}

// Полная карточка для внутреннего использования
export interface FSRSCard {
    // Хранимые данные
    modernCard: ModernFSRSCard;
    // Вычисляемые поля
    computedState: ComputedCardState;
}

// Интерфейс для параметров алгоритма FSRS
export interface FSRSParameters {
    // Параметры алгоритма (используются фиксированные веса из библиотеки rs-fsrs)
    request_retention: number; // целевой уровень запоминания (0.0-1.0)
    maximum_interval: number; // максимальный интервал в днях
    enable_fuzz: boolean; // включить случайное изменение интервалов
}

// Интерфейс для настроек FSRS плагина
export interface FSRSSettings {
    // Параметры алгоритма FSRS
    parameters: FSRSParameters;

    // Настройки по умолчанию для новых карточек
    default_initial_stability: number;
    default_initial_difficulty: number;

    // Настройка для автоматического добавления кнопки повторения
    auto_add_review_button: boolean;

    // Минимальный интервал для досрочного повторения
    minimum_review_interval_minutes: number;

    // Паттерны игнорирования файлов и папок
    ignore_patterns: string[];

    // Значок статус-бара
    status_bar_icon: string;
}

// Интерфейс для результатов повторения карточки
export interface FSRSReviewResult {
    card: FSRSCard;
    rating: FSRSRating;
    review_time: string; // ISO 8601 строка
    next_review_dates: {
        again?: string;
        hard?: string;
        good?: string;
        easy?: string;
    };
}

// Интерфейс для статистики FSRS
export interface FSRSStatistics {
    total_cards: number;
    cards_for_review: number;
    cards_by_state: {
        new: number;
        learning: number;
        review: number;
        relearning: number;
    };
    average_stability: number;
    average_difficulty: number;
    average_retrievability: number;
    completion_rate: number;
}

// Результат парсинга frontmatter
export interface ParseResult {
    success: boolean;
    card: ModernFSRSCard | null;
    error?: string;
}
