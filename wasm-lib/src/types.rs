use serde::{Deserialize, Serialize};

// Структуры для нового формата с reviews

/// Сессия повторения карточки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSession {
    pub date: String,   // ISO 8601 строка
    pub rating: String, // "Again", "Hard", "Good", "Easy"
    pub stability: f64,
    pub difficulty: f64,
}

/// Современная карточка FSRS с reviews
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModernFsrsCard {
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
