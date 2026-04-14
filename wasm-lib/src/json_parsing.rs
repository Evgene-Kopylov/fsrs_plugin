// Модуль для парсинга JSON и обработки ошибок

use crate::types::{ModernFsrsCard, FsrsParameters};
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

/// Результат парсинга с информацией об ошибке
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(unused)]
pub struct ParseResult<T> {
    pub had_error: bool,
    pub value: T,
    pub error_message: Option<String>,
}

/// Парсит карточку из JSON строки
pub fn parse_card_from_json(card_json: &str) -> ModernFsrsCard {
    serde_json::from_str(card_json)
        .unwrap_or_else(|_| {
            // Дефолтная карточка при ошибке парсинга
            ModernFsrsCard {
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
        .unwrap_or_else(|_| r#"{"reviews": []}"#.to_string())
}

/// Преобразует параметры в JSON строку
pub fn parameters_to_json(parameters: &FsrsParameters) -> String {
    serde_json::to_string(parameters)
        .unwrap_or_else(|_| r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#.to_string())
}

/// Создает карточку с дефолтными значениями
pub fn create_default_card() -> ModernFsrsCard {
    ModernFsrsCard {
        reviews: Vec::new(),
    }
}

/// Создает дефолтные параметры
pub fn create_default_parameters() -> FsrsParameters {
    FsrsParameters {
        request_retention: 0.9,
        maximum_interval: 36500.0,
        enable_fuzz: true,
    }
}

/// Парсит карточку с информацией об ошибке
#[allow(unused)]
pub fn parse_card_with_error_info(card_json: &str) -> ParseResult<ModernFsrsCard> {
    match serde_json::from_str::<ModernFsrsCard>(card_json) {
        Ok(card) => ParseResult {
            had_error: false,
            value: card,
            error_message: None,
        },
        Err(e) => ParseResult {
            had_error: true,
            value: create_default_card(),
            error_message: Some(e.to_string()),
        },
    }
}

/// Парсит параметры с информацией об ошибке
#[allow(unused)]
pub fn parse_parameters_with_error_info(parameters_json: &str) -> ParseResult<FsrsParameters> {
    match serde_json::from_str::<FsrsParameters>(parameters_json) {
        Ok(params) => ParseResult {
            had_error: false,
            value: params,
            error_message: None,
        },
        Err(e) => ParseResult {
            had_error: true,
            value: create_default_parameters(),
            error_message: Some(e.to_string()),
        },
    }
}

/// Получает YAML строку для новой карточки
pub fn get_fsrs_yaml() -> String {
    use serde_yaml;
    let card = create_default_card();
    serde_yaml::to_string(&card)
        .unwrap_or_else(|_| "reviews: []".to_string())
}

/// Получает текущее время в формате ISO 8601
pub fn get_current_time() -> String {
    use chrono::Utc;
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ModernFsrsCard, FsrsParameters, ReviewSession};
    use chrono::{DateTime, Utc, TimeZone};

    #[test]
    fn test_parse_card_from_json_valid() {
        let json = r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:00:00Z",
                    "rating": "Good",
                    "stability": 5.0,
                    "difficulty": 3.0
                }
            ]
        }"#;

        let card = parse_card_from_json(json);
        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].date, "2025-01-01T10:00:00Z");
        assert_eq!(card.reviews[0].rating, "Good");
        assert_eq!(card.reviews[0].stability, 5.0);
        assert_eq!(card.reviews[0].difficulty, 3.0);
    }

    #[test]
    fn test_parse_card_from_json_invalid() {
        // Невалидный JSON должен вернуть дефолтную карточку
        let json = r#"{invalid json}"#;
        let card = parse_card_from_json(json);
        assert!(card.reviews.is_empty());
    }

    #[test]
    fn test_parse_card_from_json_missing_fields() {
        // JSON с неполными данными - должен парситься, но с дефолтными значениями
        let json = r#"{}"#;
        let card = parse_card_from_json(json);
        assert!(card.reviews.is_empty());
    }

    #[test]
    fn test_parse_parameters_from_json_valid() {
        let json = r#"{
            "request_retention": 0.85,
            "maximum_interval": 1000.0,
            "enable_fuzz": false
        }"#;

        let params = parse_parameters_from_json(json);
        assert_eq!(params.request_retention, 0.85);
        assert_eq!(params.maximum_interval, 1000.0);
        assert_eq!(params.enable_fuzz, false);
    }

    #[test]
    fn test_parse_parameters_from_json_invalid() {
        let json = r#"{not json}"#;
        let params = parse_parameters_from_json(json);
        // Должны вернуться дефолтные значения
        assert_eq!(params.request_retention, 0.9);
        assert_eq!(params.maximum_interval, 36500.0);
        assert_eq!(params.enable_fuzz, true);
    }

    #[test]
    fn test_parse_datetime_from_iso_valid() {
        let iso_str = "2025-01-01T10:30:45Z";
        let dt = parse_datetime_from_iso(iso_str);

        let expected = Utc.with_ymd_and_hms(2025, 1, 1, 10, 30, 45).unwrap();
        assert_eq!(dt, expected);
    }

    #[test]
    fn test_parse_datetime_from_iso_invalid() {
        // Невалидная дата должна вернуть текущее время
        let iso_str = "invalid date";
        let dt = parse_datetime_from_iso(iso_str);

        // Проверяем, что это валидная дата (не паника)
        let now = Utc::now();
        // Разница должна быть небольшой (несколько секунд)
        let diff = (dt - now).num_seconds().abs();
        assert!(diff < 10);
    }

    #[test]
    fn test_card_to_json_and_back() {
        let original_card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: "Good".to_string(),
                    stability: 5.0,
                    difficulty: 3.0,
                }
            ],
        };

        let json = card_to_json(&original_card);
        let parsed_card = parse_card_from_json(&json);

        assert_eq!(parsed_card.reviews.len(), original_card.reviews.len());
        assert_eq!(parsed_card.reviews[0].date, original_card.reviews[0].date);
        assert_eq!(parsed_card.reviews[0].rating, original_card.reviews[0].rating);
        assert_eq!(parsed_card.reviews[0].stability, original_card.reviews[0].stability);
        assert_eq!(parsed_card.reviews[0].difficulty, original_card.reviews[0].difficulty);
    }

    #[test]
    fn test_parameters_to_json_and_back() {
        let original_params = FsrsParameters {
            request_retention: 0.85,
            maximum_interval: 1000.0,
            enable_fuzz: false,
        };

        let json = parameters_to_json(&original_params);
        let parsed_params = parse_parameters_from_json(&json);

        assert_eq!(parsed_params.request_retention, original_params.request_retention);
        assert_eq!(parsed_params.maximum_interval, original_params.maximum_interval);
        assert_eq!(parsed_params.enable_fuzz, original_params.enable_fuzz);
    }

    #[test]
    fn test_create_default_card() {
        let card = create_default_card();
        assert!(card.reviews.is_empty());
    }

    #[test]
    fn test_create_default_parameters() {
        let params = create_default_parameters();
        assert_eq!(params.request_retention, 0.9);
        assert_eq!(params.maximum_interval, 36500.0);
        assert_eq!(params.enable_fuzz, true);
    }

    #[test]
    fn test_parse_card_with_error_info_valid() {
        let json = r#"{"reviews": []}"#;
        let result = parse_card_with_error_info(json);

        assert!(!result.had_error);
        assert!(result.value.reviews.is_empty());
    }

    #[test]
    fn test_parse_card_with_error_info_invalid() {
        let json = r#"{invalid}"#;
        let result = parse_card_with_error_info(json);

        assert!(result.had_error);
        // Должна вернуться дефолтная карточка
        assert!(result.value.reviews.is_empty());
    }

    #[test]
    fn test_parse_parameters_with_error_info() {
        // Тест валидных параметров
        let valid_json = r#"{"request_retention": 0.8, "maximum_interval": 500.0, "enable_fuzz": true}"#;
        let valid_result = parse_parameters_with_error_info(valid_json);
        assert!(!valid_result.had_error);
        assert_eq!(valid_result.value.request_retention, 0.8);

        // Тест невалидных параметров
        let invalid_json = r#"{bad}"#;
        let invalid_result = parse_parameters_with_error_info(invalid_json);
        assert!(invalid_result.had_error);
        assert_eq!(invalid_result.value.request_retention, 0.9); // дефолтное значение
    }

    #[test]
    fn test_get_fsrs_yaml() {
        let yaml = get_fsrs_yaml();
        // YAML должен содержать ожидаемые поля
        assert!(yaml.contains("reviews: []"));
    }

    #[test]
    fn test_get_current_time() {
        let time_str = get_current_time();
        // Проверяем, что это валидная дата ISO 8601
        let result: Result<DateTime<Utc>, _> = time_str.parse();
        assert!(result.is_ok());

        let dt = result.unwrap();
        let now = Utc::now();
        let diff = (dt - now).num_seconds().abs();
        assert!(diff < 2); // Должно быть почти текущее время
    }
}
