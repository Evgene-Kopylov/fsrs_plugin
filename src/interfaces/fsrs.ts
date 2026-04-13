// Интерфейсы для FSRS плагина Obsidian

// Состояния карточки FSRS
export type FSRSState = "New" | "Learning" | "Review" | "Relearning";

// Оценки для повторения
export type FSRSRating = "Again" | "Hard" | "Good" | "Easy";

// Интерфейс для карточки FSRS
export interface FSRSCard {
	due: string; // ISO 8601 строка
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	state: FSRSState;
	last_review: string; // ISO 8601 строка
	filePath: string; // путь к файлу в хранилище Obsidian
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

// Интерфейс для параметров алгоритма FSRS
export interface FSRSParameters {
	// Параметры по умолчанию из библиотеки rs-fsrs
	request_retention?: number;
	maximum_interval?: number;
	w?: number[]; // веса алгоритма
	enable_fuzz?: boolean;
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
	completion_rate: number;
}

// Интерфейс для настроек FSRS (расширяет базовые настройки плагина)
export interface FSRSSettings {
	// Базовые параметры FSRS
	fsrs_parameters: FSRSParameters;

	// Настройки отображения
	show_stability: boolean;
	show_difficulty: boolean;
	show_retrievability: boolean;
	max_cards_to_show: number;

	// Настройки обновления
	auto_refresh: boolean;
	refresh_interval: number; // в минутах

	// Настройки фильтрации
	filter_by_folders: string[];
	filter_by_tags: string[];
	exclude_states: FSRSState[];

	// Настройки уведомлений
	show_notifications: boolean;
	notification_threshold: number; // минимальное количество карточек для уведомления
}
