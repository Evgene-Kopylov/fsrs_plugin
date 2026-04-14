// Интерфейсы для FSRS плагина Obsidian (обновленные для формата с reviews)

// Состояния карточки FSRS
export type FSRSState = "New" | "Learning" | "Review" | "Relearning";

// Оценки для повторения
export type FSRSRating = "Again" | "Hard" | "Good" | "Easy";

// Сессия повторения карточки (хранится в истории)
export interface ReviewSession {
	date: string; // ISO 8601 строка
	rating: FSRSRating;
	stability: number;
	difficulty: number;
}

// Современная карточка FSRS (новый формат)
export interface ModernFSRSCard {
	reviews: ReviewSession[]; // история сессий повторения
	filePath: string; // путь к файлу в хранилище Obsidian
}

// Вычисляемое текущее состояние карточки (не хранится, вычисляется)
export interface ComputedCardState {
	due: string; // ISO 8601 строка (следующая дата повторения)
	stability: number;
	difficulty: number;
	state: FSRSState;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	retrievability: number; // извлекаемость (0.0-1.0)
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

	// Настройки отображения
	show_stability: boolean;
	show_difficulty: boolean;
	show_retrievability: boolean;
	show_advanced_stats: boolean;
	max_cards_to_show: number;

	// Настройка для автоматического добавления кнопки повторения
	auto_add_review_button: boolean;

	// Настройки обновления
	auto_refresh: boolean;
	refresh_interval: number; // в минутах
	minimum_review_interval_minutes: number; // минимальный интервал для досрочного повторения (40 минут)

	// Настройки фильтрации
	filter_by_folders: string[];
	filter_by_tags: string[];
	exclude_states: FSRSState[];

	// Настройки уведомлений
	show_notifications: boolean;
	notification_threshold: number; // минимальное количество карточек для уведомления
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

// Интерфейс для миграции (если понадобится в будущем)
export interface LegacyFSRSCard {
	due: string;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	state: FSRSState;
	last_review: string;
	filePath: string;
}
