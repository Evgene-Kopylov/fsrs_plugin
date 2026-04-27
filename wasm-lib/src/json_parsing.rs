// Модуль для парсинга JSON и обработки ошибок

use crate::types::{FsrsParameters, ModernFsrsCard};
use chrono::{DateTime, Utc};

/// Парсит карточку из JSON строки
pub fn parse_card_from_json(card_json: &str) -> ModernFsrsCard {
    serde_json::from_str(card_json).unwrap_or_else(|_| {
        // Дефолтная карточка при ошибке парсинга
        ModernFsrsCard {
            reviews: Vec::new(),
            file_path: None,
        }
    })
}

/// Парсит параметры алгоритма из JSON строки
pub fn parse_parameters_from_json(parameters_json: &str) -> FsrsParameters {
    serde_json::from_str(parameters_json).unwrap_or({
        // Дефолтные параметры
        FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 36500.0,
            enable_fuzz: true,
        }
    })
}

/// Гибкий парсер дат, поддерживающий различные форматы ISO 8601
pub fn parse_datetime_flexible(date_str: &str) -> Option<DateTime<Utc>> {
    // Удаляем начальные и конечные пробелы
    let date_str = date_str.trim();

    // 1. Пробуем полный RFC3339 (ISO 8601 с часовым поясом)
    // Примеры: "2026-04-11T14:54:23.822+00:00", "2026-04-11T14:54:23Z"
    if let Ok(dt) = DateTime::parse_from_rfc3339(date_str) {
        return Some(dt.with_timezone(&Utc));
    }

    // 2. Пробуем как DateTime<Utc> напрямую (для строк с 'Z' на конце)
    #[allow(clippy::collapsible_if)]
    if date_str.ends_with('Z') {
        if let Ok(dt) = date_str.parse::<DateTime<Utc>>() {
            return Some(dt);
        }
    }

    // 3. Пробуем различные форматы NaiveDateTime без часового пояса

    // С миллисекундами: "2026-04-11T14:54:23.822"
    if let Ok(naive_dt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%dT%H:%M:%S%.f") {
        return Some(DateTime::from_naive_utc_and_offset(naive_dt, Utc));
    }

    // Без миллисекунд: "2026-04-08T15:59:16"
    if let Ok(naive_dt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%dT%H:%M:%S") {
        return Some(DateTime::from_naive_utc_and_offset(naive_dt, Utc));
    }

    // 4. Пробуем без 'T' разделителя
    if let Ok(naive_dt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d %H:%M:%S") {
        return Some(DateTime::from_naive_utc_and_offset(naive_dt, Utc));
    }

    // 5. Пробуем формат Obsidian: "ГГГГ-ММ-ДД_чч:мм"
    if let Ok(naive_dt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d_%H:%M") {
        return Some(DateTime::from_naive_utc_and_offset(naive_dt, Utc));
    }

    // 6. Последняя попытка: стандартный парсер
    date_str.parse::<DateTime<Utc>>().ok()
}

/// Преобразует карточку в JSON строку
pub fn card_to_json(card: &ModernFsrsCard) -> String {
    serde_json::to_string(card).unwrap_or_else(|_| r#"{"reviews": []}"#.to_string())
}

/// Преобразует параметры в JSON строку
pub fn parameters_to_json(parameters: &FsrsParameters) -> String {
    serde_json::to_string(parameters).unwrap_or_else(|_| {
        r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
            .to_string()
    })
}

/// Создает карточку с дефолтными значениями
pub fn create_default_card() -> ModernFsrsCard {
    ModernFsrsCard {
        reviews: Vec::new(),
        file_path: None,
    }
}

/// Получает YAML строку для новой карточки
pub fn get_fsrs_yaml() -> String {
    use serde_yaml;
    let card = create_default_card();
    serde_yaml::to_string(&card).unwrap_or_else(|_| "reviews: []".to_string())
}

/// Получает текущее время в формате ISO 8601
pub fn get_current_time() -> String {
    use chrono::Utc;
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{FsrsParameters, ModernFsrsCard, ReviewSession};
    use chrono::{DateTime, Datelike, Timelike, Utc};

    #[test]
    fn test_parse_card_from_json_valid() {
        let json = r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:00:00Z",
                    "rating": 2
                }
            ]
        }"#;

        let card = parse_card_from_json(json);
        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].date, "2025-01-01T10:00:00Z");
        assert_eq!(card.reviews[0].rating, 2u8);
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
    fn test_parse_datetime_flexible_with_timezone() {
        // Тест с часовым поясом
        let date_str = "2026-04-11T14:54:23.822+00:00";
        let dt = parse_datetime_flexible(date_str).expect("Should parse with timezone");

        assert_eq!(dt.year(), 2026);
        assert_eq!(dt.month(), 4);
        assert_eq!(dt.day(), 11);
        assert_eq!(dt.hour(), 14);
        assert_eq!(dt.minute(), 54);
        assert_eq!(dt.second(), 23);
        assert_eq!(dt.nanosecond(), 822_000_000);
    }

    #[test]
    fn test_parse_datetime_flexible_without_timezone() {
        // Тест без часового пояса
        let date_str = "2026-04-08T15:59:16";
        let dt = parse_datetime_flexible(date_str).expect("Should parse without timezone");

        assert_eq!(dt.year(), 2026);
        assert_eq!(dt.month(), 4);
        assert_eq!(dt.day(), 8);
        assert_eq!(dt.hour(), 15);
        assert_eq!(dt.minute(), 59);
        assert_eq!(dt.second(), 16);
        assert_eq!(dt.nanosecond(), 0);
    }

    #[test]
    fn test_parse_datetime_flexible_with_z_suffix() {
        // Тест с 'Z' на конце
        let date_str = "2025-01-01T10:00:00Z";
        let dt = parse_datetime_flexible(date_str).expect("Should parse with Z suffix");

        assert_eq!(dt.year(), 2025);
        assert_eq!(dt.month(), 1);
        assert_eq!(dt.day(), 1);
        assert_eq!(dt.hour(), 10);
        assert_eq!(dt.minute(), 0);
        assert_eq!(dt.second(), 0);
    }

    #[test]
    fn test_parse_datetime_flexible_invalid() {
        // Невалидная дата должна вернуть None
        let date_str = "not a date";
        let result = parse_datetime_flexible(date_str);
        assert!(result.is_none());
    }

    #[test]
    fn test_card_to_json_and_back() {
        let original_card = ModernFsrsCard {
            reviews: vec![ReviewSession {
                date: "2025-01-01T10:00:00Z".to_string(),
                rating: 2u8,
            }],
            file_path: None,
        };

        let json = card_to_json(&original_card);
        let parsed_card = parse_card_from_json(&json);

        assert_eq!(parsed_card.reviews.len(), original_card.reviews.len());
        assert_eq!(parsed_card.reviews[0].date, original_card.reviews[0].date);
        assert_eq!(
            parsed_card.reviews[0].rating,
            original_card.reviews[0].rating
        );
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

        assert_eq!(
            parsed_params.request_retention,
            original_params.request_retention
        );
        assert_eq!(
            parsed_params.maximum_interval,
            original_params.maximum_interval
        );
        assert_eq!(parsed_params.enable_fuzz, original_params.enable_fuzz);
    }

    #[test]
    fn test_create_default_card() {
        let card = create_default_card();
        assert!(card.reviews.is_empty());
        assert!(card.file_path.is_none());
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
