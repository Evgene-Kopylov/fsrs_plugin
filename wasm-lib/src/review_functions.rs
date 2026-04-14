// Модуль для функций обработки повторения карточек FSRS

use rs_fsrs::FSRS;
use chrono::{DateTime, Utc};
use serde_json;
use serde_yaml;

use crate::types::{ModernFsrsCard, ReviewSession};
use crate::conversion::{rating_from_str, rating_to_string, create_fsrs_parameters};
use crate::fsrs_logic::create_card_from_last_session;
use crate::json_parsing::{parse_card_from_json, parse_parameters_from_json, parse_datetime_from_iso};

/// Обновляет карточку FSRS на основе оценки
pub fn review_card(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим входные данные
    let mut card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_from_iso(&now_str);
    let rating = rating_from_str(&rating_str);

    // Создаем Card для алгоритма FSRS из истории reviews
    let mut fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Обновляем elapsed_days на основе последней сессии
    if let Some(last_session) = card.reviews.last() {
        if let Ok(last_date) = last_session.date.parse::<DateTime<Utc>>() {
            let elapsed_days = (now - last_date).num_days().max(0) as i64;
            fsrs_card.elapsed_days = elapsed_days;
        }
    }

    // Применяем алгоритм FSRS
    let fsrs_params = create_fsrs_parameters(&parameters);
    let fsrs = FSRS::new(fsrs_params);
    let scheduling_info = fsrs.next(fsrs_card, now, rating);
    let updated_card = scheduling_info.card;

    // Добавляем новую сессию в карточку
    let new_session = ReviewSession {
        date: now.to_rfc3339(),
        rating: rating_to_string(rating),
        stability: updated_card.stability,
        difficulty: updated_card.difficulty,
    };

    card.reviews.push(new_session);

    // Возвращаем обновленную карточку в формате JSON
    serde_json::to_string(&card)
        .unwrap_or_else(|_| r#"{"reviews": []}"#.to_string())
}

/// Получает YAML строку после повторения карточки
pub fn get_fsrs_yaml_after_review(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Обновляем карточку
    let updated_card_json = review_card(
        card_json,
        rating_str,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим обновленную карточку
    let card: ModernFsrsCard = serde_json::from_str(&updated_card_json)
        .unwrap_or_else(|_| {
            ModernFsrsCard {
                reviews: Vec::new(),
            }
        });

    // Сериализуем в YAML
    serde_yaml::to_string(&card)
        .unwrap_or_else(|_| "reviews: []".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json;
    use chrono::{DateTime, Utc};

    fn create_test_parameters_json() -> String {
        r#"{"request_retention": 0.9, "maximum_interval": 365.0, "enable_fuzz": false}"#.to_string()
    }

    fn create_empty_card_json() -> String {
        r#"{"reviews": []}"#.to_string()
    }

    fn create_card_with_reviews_json() -> String {
        r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:00:00Z",
                    "rating": "Good",
                    "stability": 5.0,
                    "difficulty": 3.0
                }
            ]
        }"#.to_string()
    }

    #[test]
    fn test_review_card_empty_card() {
        let card_json = create_empty_card_json();
        let rating = "Good".to_string();
        let now = "2025-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = review_card(
            card_json,
            rating,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        // Проверяем, что результат - валидный JSON
        let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let card = parsed_result.unwrap();
        assert_eq!(card.reviews.len(), 1); // Добавилась одна сессия

        let new_session = &card.reviews[0];
        let parsed_date: DateTime<Utc> = new_session.date.parse().unwrap();
        let expected_date: DateTime<Utc> = "2025-01-01T12:00:00Z".parse().unwrap();
        assert_eq!(parsed_date, expected_date);
        assert_eq!(new_session.rating, "Good");
        // Стабильность и сложность должны быть установлены (FSRS алгортим их вычислит)
        assert!(new_session.stability > 0.0);
        assert!(new_session.difficulty > 0.0);
    }

    #[test]
    fn test_review_card_with_existing_reviews() {
        let card_json = create_card_with_reviews_json();
        let rating = "Easy".to_string();
        let now = "2025-01-02T14:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = review_card(
            card_json,
            rating,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let card = parsed_result.unwrap();
        assert_eq!(card.reviews.len(), 2); // Старая + новая сессия

        // Проверяем, что старая сессия сохранилась
        assert_eq!(card.reviews[0].date, "2025-01-01T10:00:00Z");
        assert_eq!(card.reviews[0].rating, "Good");
        assert_eq!(card.reviews[0].stability, 5.0);
        assert_eq!(card.reviews[0].difficulty, 3.0);

        // Проверяем новую сессию
        let parsed_date: DateTime<Utc> = card.reviews[1].date.parse().unwrap();
        let expected_date: DateTime<Utc> = "2025-01-02T14:00:00Z".parse().unwrap();
        assert_eq!(parsed_date, expected_date);
        assert_eq!(card.reviews[1].rating, "Easy");
        assert!(card.reviews[1].stability > 0.0);
        assert!(card.reviews[1].difficulty > 0.0);
    }

    #[test]
    fn test_review_card_different_ratings() {
        let ratings = vec!["Again", "Hard", "Good", "Easy"];

        for rating_str in ratings {
            let card_json = create_empty_card_json();
            let rating = rating_str.to_string();
            let now = "2025-01-01T12:00:00Z".to_string();
            let params_json = create_test_parameters_json();
            let default_stability = 2.5;
            let default_difficulty = 5.0;

            let result = review_card(
                card_json,
                rating.clone(),
                now.clone(),
                params_json.clone(),
                default_stability,
                default_difficulty,
            );

            let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
            assert!(parsed_result.is_ok(), "Failed to parse result for rating: {}", rating_str);

            let card = parsed_result.unwrap();
            assert_eq!(card.reviews.len(), 1);
            assert_eq!(card.reviews[0].rating, rating_str);
        }
    }

    #[test]
    fn test_review_card_invalid_json() {
        let invalid_json = r#"{invalid json}"#.to_string();
        let rating = "Good".to_string();
        let now = "2025-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        // Не должно паниковать, должно вернуть дефолтную карточку с новой сессией
        let result = review_card(
            invalid_json,
            rating,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let card = parsed_result.unwrap();
        assert_eq!(card.reviews.len(), 1); // Добавилась сессия
    }

    #[test]
    fn test_review_card_invalid_date() {
        let card_json = create_empty_card_json();
        let rating = "Good".to_string();
        let invalid_now = "invalid date".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        // Не должно паниковать, должно использовать текущее время
        let result = review_card(
            card_json,
            rating,
            invalid_now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let card = parsed_result.unwrap();
        assert_eq!(card.reviews.len(), 1);

        // Дата должна быть валидной ISO строкой
        let date_result: Result<DateTime<Utc>, _> = card.reviews[0].date.parse();
        assert!(date_result.is_ok());
    }

    #[test]
    fn test_get_fsrs_yaml_after_review() {
        let card_json = create_empty_card_json();
        let rating = "Good".to_string();
        let now = "2025-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let yaml_result = get_fsrs_yaml_after_review(
            card_json,
            rating,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        // Проверяем, что это валидный YAML
        assert!(!yaml_result.contains("srs: true"));
        assert!(yaml_result.contains("reviews:"));
        assert!(yaml_result.contains("- date:"));
        assert!(yaml_result.contains("rating: Good"));

        // Пробуем парсить YAML обратно
        let parsed_yaml: Result<ModernFsrsCard, _> = serde_yaml::from_str(&yaml_result);
        assert!(parsed_yaml.is_ok(), "Invalid YAML generated: {}", yaml_result);

        let card = parsed_yaml.unwrap();
        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].rating, "Good");
    }

    #[test]
    fn test_get_fsrs_yaml_after_review_with_existing_reviews() {
        let card_json = create_card_with_reviews_json();
        let rating = "Hard".to_string();
        let now = "2025-01-02T14:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let yaml_result = get_fsrs_yaml_after_review(
            card_json,
            rating,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        assert!(!yaml_result.contains("srs: true"));
        assert!(yaml_result.contains("reviews:"));

        // Должно быть два элемента в массиве reviews
        let yaml_lines: Vec<&str> = yaml_result.lines().collect();
        let review_lines: Vec<&str> = yaml_lines.iter()
            .filter(|line| line.trim().starts_with("- date:"))
            .copied()
            .collect();

        assert_eq!(review_lines.len(), 2, "Expected 2 review entries in YAML");

        // Проверяем парсинг
        let parsed_yaml: Result<ModernFsrsCard, _> = serde_yaml::from_str(&yaml_result);
        assert!(parsed_yaml.is_ok());

        let card = parsed_yaml.unwrap();
        assert_eq!(card.reviews.len(), 2);
        assert_eq!(card.reviews[0].rating, "Good");
        assert_eq!(card.reviews[1].rating, "Hard");
    }

    #[test]
    fn test_review_card_elapsed_days_calculation() {
        let card_json = r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:00:00Z",
                    "rating": "Good",
                    "stability": 5.0,
                    "difficulty": 3.0
                }
            ]
        }"#.to_string();

        let rating = "Good".to_string();
        let now = "2025-01-03T14:00:00Z".to_string(); // 2 дня спустя
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = review_card(
            card_json,
            rating,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        // Функция должна обработать elapsed_days корректно (не падать)
        let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let card = parsed_result.unwrap();
        assert_eq!(card.reviews.len(), 2);
        // Новая сессия должна иметь дату "now"
        let parsed_date: DateTime<Utc> = card.reviews[1].date.parse().unwrap();
        let expected_date: DateTime<Utc> = "2025-01-03T14:00:00Z".parse().unwrap();
        assert_eq!(parsed_date, expected_date);
    }

    #[test]
    fn test_review_card_parameter_variations() {
        let test_cases = vec![
            (r#"{"request_retention": 0.85, "maximum_interval": 100.0, "enable_fuzz": false}"#, "Different retention"),
            (r#"{"request_retention": 0.9, "maximum_interval": 1000.0, "enable_fuzz": true}"#, "With fuzz enabled"),
            (r#"{"request_retention": 0.95, "maximum_interval": 36500.0, "enable_fuzz": false}"#, "High retention"),
        ];

        for (params_json, description) in test_cases {
            let card_json = create_empty_card_json();
            let rating = "Good".to_string();
            let now = "2025-01-01T12:00:00Z".to_string();
            let default_stability = 2.5;
            let default_difficulty = 5.0;

            let result = review_card(
                card_json,
                rating.clone(),
                now.clone(),
                params_json.to_string(),
                default_stability,
                default_difficulty,
            );

            let parsed_result: Result<ModernFsrsCard, _> = serde_json::from_str(&result);
            assert!(parsed_result.is_ok(), "Failed for case: {}", description);

            let card = parsed_result.unwrap();
            assert_eq!(card.reviews.len(), 1, "Failed for case: {}", description);
            assert_eq!(card.reviews[0].rating, "Good", "Failed for case: {}", description);
        }
    }
}
