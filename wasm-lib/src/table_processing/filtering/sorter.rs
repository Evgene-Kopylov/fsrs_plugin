use serde::{Deserialize, Serialize};

/// Ошибки фильтрации и сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterError {
    /// Ошибка парсинга JSON
    JsonParseError(String),
    /// Отсутствует поле для сортировки
    MissingSortField(String),
    /// Некорректный тип данных
    InvalidDataType(String),
    /// Ошибка сортировки
    SortFailed(String),
    /// Функция не реализована
    NotImplemented,
}

impl std::fmt::Display for FilterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FilterError::JsonParseError(msg) => write!(f, "Ошибка парсинга JSON: {}", msg),
            FilterError::MissingSortField(field) => {
                write!(f, "Отсутствует поле для сортировки: {}", field)
            }
            FilterError::InvalidDataType(msg) => write!(f, "Некорректный тип данных: {}", msg),
            FilterError::SortFailed(msg) => write!(f, "Ошибка сортировки: {}", msg),
            FilterError::NotImplemented => write!(f, "Функция не реализована"),
        }
    }
}

impl std::error::Error for FilterError {}
