import type {
	FSRSParameters,
	FSRSSettings,
	FSRSState,
} from "./interfaces/fsrs";
import type { TableColumn } from "./utils/fsrs-table-params";

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
	auto_add_review_button: true,

	// Минимальный интервал для досрочного повторения
	minimum_review_interval_minutes: 40,

	// Паттерны игнорирования файлов и папок
	ignore_patterns: [],
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

// Время жизни кэша карточек в миллисекундах
export const CARD_CACHE_TTL_MS = 5000;

// Колонки таблицы по умолчанию
export const DEFAULT_COLUMNS: TableColumn[] = [
	{ field: "file", title: "Файл" },
	{ field: "reps", title: "Повторений" },
	{ field: "overdue", title: "Просрочка" },
];

// Переводы состояний карточек на русский язык
export const STATE_TRANSLATIONS: Record<FSRSState, string> = {
	New: "Новая",
	Learning: "Изучение",
	Review: "Повторение",
	Relearning: "Переизучение",
};

// Заголовки по умолчанию для полей таблицы
export const FIELD_TITLES: Record<string, string> = {
	file: "Файл",
	reps: "Повторений",
	overdue: "Просрочка",
	stability: "Стабильность",
	difficulty: "Сложность",
	retrievability: "Извлекаемость",
	due: "Следующее повторение",
	state: "Состояние",
	elapsed: "Прошло дней",
	scheduled: "Запланировано дней",
};

// Конфигурация блоков таблицы по умолчанию для разных режимов
export const DEFAULT_TABLE_CONFIGS = {
	due: {
		columns:
			'file as "Файл", reps as "Повторений", overdue as "Просрочка", retrievability as "Извлекаемость"',
		limit: 20,
	},
	all: {
		columns:
			'file as "Файл", reps as "Повторений", overdue as "Просрочка", state as "Состояние", due as "Следующее повторение"',
		limit: 20,
	},
} as const;

// Настройки уведомлений (оставлены для совместимости, но не используются)
export const DEFAULT_NOTIFICATION_SETTINGS = {
	show_notifications: true,
	notification_threshold: 5,
} as const;

// Настройки обновления (оставлены для совместимости, но не используются)
export const DEFAULT_REFRESH_SETTINGS = {
	auto_refresh: true,
	refresh_interval: 5, // 5 минут
} as const;
