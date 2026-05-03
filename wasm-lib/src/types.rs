use serde::{Deserialize, Serialize};

// Структуры для нового формата с reviews

/// Сессия повторения карточки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSession {
    pub date: String, // ISO 8601 строка
    pub rating: u8,   // 0=Again, 1=Hard, 2=Good, 3=Easy
}

/// Современная карточка FSRS с reviews
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CardData {
    #[serde(default)]
    pub reviews: Vec<ReviewSession>,
    #[serde(default, rename = "filePath", skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>, // путь к файлу в хранилище Obsidian
}

/// Параметры алгоритма FSRS из настроек плагина
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsrsParameters {
    pub request_retention: f64,
    pub maximum_interval: f64,
    pub enable_fuzz: bool,
}

/// Результат вычисления текущего состояния
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedState {
    pub due: String, // следующая дата повторения (ISO 8601)
    pub stability: f64,
    pub difficulty: f64,
    pub state: String, // "New", "Learning", "Review", "Relearning"
    pub elapsed_days: u64,
    pub scheduled_days: u64,
    pub reps: u64,
    pub lapses: u64,
    pub retrievability: f64,
}

/// Историческое состояние карточки (после повторения)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalState {
    /// Дата события (ISO 8601)
    pub date: String,
    /// Рейтинг, если это момент после повторения
    pub rating: Option<u8>,
    /// Стабильность после повторения
    pub stability: f64,
    /// Сложность после повторения
    pub difficulty: f64,
    /// Состояние карточки после повторения
    pub state: String,
    /// Дней, прошедших с предыдущего повторения (0 для первого)
    pub elapsed_days: u64,
    /// Запланированный интервал (дней) после этого повторения
    pub scheduled_days: u64,
    /// Извлекаемость сразу после ответа (всегда 1.0)
    pub retrievability: f64,
    /// Извлекаемость перед ответом (на дату этого повторения)
    pub retrievability_before: Option<f64>,
    /// Извлекаемость на момент следующего повторения (если есть)
    pub retrievability_next: Option<f64>,
}
