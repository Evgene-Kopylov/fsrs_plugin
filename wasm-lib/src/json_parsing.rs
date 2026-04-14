// Модуль для парсинга JSON и обработки ошибок

use crate::types::{ModernFsrsCard, FsrsParameters};
use chrono::{DateTime, Utc};

/// Парсит карточку из JSON строки
pub fn parse_card_from_json(card_json: &str) -> ModernFsrsCard {
    serde_json::from_str(card_json)
        .unwrap_or_else(|_| {
            // Дефолтная карточка при ошибке парсинга
            ModernFsrsCard {
                srs: true,
                reviews: Vec::new(),
            }
        })
}

/// Парсит параметры алгоритма из JSON строки
pub fn parse_parameters_from_json(parameters_json: &str) -> FsrsParameters {
    serde_json::from_str(parameters_json)
        .unwrap_or_else(|_| {
            // Дефолтные параметры
            FsrsParameters {
                request_retention: 0.9,
                maximum_interval: 36500.0,
                enable_fuzz: true,
            }
        })
}

/// Парсит дату из строки ISO 8601
pub fn parse_datetime_from_iso(iso_str: &str) -> DateTime<Utc> {
    iso_str.parse().unwrap_or_else(|_| Utc::now())
}

/// Преобразует карточку в JSON строку
pub fn card_to_json(card: &ModernFsrsCard) -> String {
    serde_json::to_string(card)
        .unwrap_or_else(|_| r#"{"srs": true, "reviews": []}"#.to_string())
}

/// Преобразует параметры в JSON строку
pub fn parameters_to_json(parameters: &FsrsParameters) -> String {
    serde_json::to_string(parameters)
        .unwrap_or_else(|_| r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#.to_string())
}

/// Создает карточку с дефолтными значениями
pub fn create_default_card() -> ModernFsrsCard {
    ModernFsrsCard {
        srs: true,
        reviews: Vec::new(),
    }
}

/// Создает параметры с дефолтными значениями
pub fn create_default_parameters() -> FsrsParameters {
    FsrsParameters {
        request_retention: 0.9,
        maximum_interval: 36500.0,
        enable_fuzz: true,
    }
}

/// Вспомогательная структура для результатов парсинга с обработкой ошибок
pub struct ParseResult<T> {
    pub value: T,
    pub had_error: bool,
}

impl<T> ParseResult<T> {
    pub fn new(value: T, had_error: bool) -> Self {
        ParseResult { value, had_error }
    }
}

/// Парсит карточку с сохранением информации об ошибке
pub fn parse_card_with_error_info(card_json: &str) -> ParseResult<ModernFsrsCard> {
    match serde_json::from_str(card_json) {
        Ok(card) => ParseResult::new(card, false),
        Err(_) => ParseResult::new(create_default_card(), true),
    }
}

/// Парсит параметры с сохранением информации об ошибке
pub fn parse_parameters_with_error_info(parameters_json: &str) -> ParseResult<FsrsParameters> {
    match serde_json::from_str(parameters_json) {
        Ok(params) => ParseResult::new(params, false),
        Err(_) => ParseResult::new(create_default_parameters(), true),
    }
}

/// Получает YAML строку для новой карточки
pub fn get_fsrs_yaml() -> String {
    use serde_yaml;
    let card = create_default_card();
    serde_yaml::to_string(&card)
        .unwrap_or_else(|_| "srs: true\nreviews: []".to_string())
}

/// Получает текущее время в формате ISO 8601
pub fn get_current_time() -> String {
    use chrono::Utc;
    Utc::now().to_rfc3339()
}
