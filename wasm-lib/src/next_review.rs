// Модуль для вычисления следующих дат повторения

use chrono::Utc;
use rs_fsrs::{FSRS, Rating};
use serde::Serialize;

use crate::conversion::create_fsrs_parameters;
use crate::fsrs_logic::create_card_from_last_session;
use crate::json_parsing::{
    parse_card_from_json, parse_datetime_flexible, parse_parameters_from_json,
};

/// Структура для следующих дат повторения
#[derive(Serialize)]
struct NextReviewDates {
    again: Option<String>,
    hard: Option<String>,
    good: Option<String>,
    easy: Option<String>,
}

/// Получает все возможные следующие даты повторения
pub fn get_next_review_dates(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим входные данные
    let card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

    // Создаем Card для алгоритма FSRS из истории reviews
    let fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Создаем экземпляр FSRS с пользовательскими параметрами
    let fsrs_params = create_fsrs_parameters(&parameters);
    let fsrs = FSRS::new(fsrs_params);

    // Получаем все возможные результаты для разных оценок
    let record_log = fsrs.repeat(fsrs_card, now);

    let mut result = NextReviewDates {
        again: None,
        hard: None,
        good: None,
        easy: None,
    };

    // Заполняем результат
    if let Some(scheduling_info) = record_log.get(&Rating::Again) {
        result.again = Some(scheduling_info.card.due.to_rfc3339());
    }

    if let Some(scheduling_info) = record_log.get(&Rating::Hard) {
        result.hard = Some(scheduling_info.card.due.to_rfc3339());
    }

    if let Some(scheduling_info) = record_log.get(&Rating::Good) {
        result.good = Some(scheduling_info.card.due.to_rfc3339());
    }

    if let Some(scheduling_info) = record_log.get(&Rating::Easy) {
        result.easy = Some(scheduling_info.card.due.to_rfc3339());
    }

    // Возвращаем результат в формате JSON
    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_parameters_json() -> String {
        r#"{"request_retention": 0.9, "maximum_interval": 365.0, "enable_fuzz": false}"#.to_string()
    }

    fn create_empty_card_json() -> String {
        r#"{"reviews": []}"#.to_string()
    }

    #[test]
    fn test_get_next_review_dates() {
        let card_json = create_empty_card_json();
        let now = "2025-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = get_next_review_dates(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<serde_json::Value, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let dates = parsed_result.unwrap();
        // Проверяем, что все поля присутствуют
        assert!(dates.get("again").is_some());
        assert!(dates.get("hard").is_some());
        assert!(dates.get("good").is_some());
        assert!(dates.get("easy").is_some());
    }

    #[test]
    fn test_enable_fuzz_affects_intervals() {
        // Создаем две одинаковые карточки с разницей в 1 минуту
        let card1_json = r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:00:00Z",
                    "rating": "Good",
                    "stability": 99.00000002,
                    "difficulty": 3.00000001
                }
            ]
        }"#
        .to_string();

        let card2_json = r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:01:00Z",
                    "rating": "Good",
                    "stability": 99.00000001,
                    "difficulty": 3.00000002
                }
            ]
        }"#
        .to_string();

        let now = "2025-01-02T10:00:00Z".to_string();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        // Параметры с включенным fuzz
        let params_fuzz_true =
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
                .to_string();
        // Параметры с выключенным fuzz
        let params_fuzz_false =
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": false}"#
                .to_string();

        // Вычисляем следующие даты повторения для карточки 1 с fuzz=true и fuzz=false
        let result1_fuzz_true = get_next_review_dates(
            card1_json.clone(),
            now.clone(),
            params_fuzz_true.clone(),
            default_stability,
            default_difficulty,
        );
        let dates1_fuzz_true: serde_json::Value = serde_json::from_str(&result1_fuzz_true).unwrap();

        let result1_fuzz_false = get_next_review_dates(
            card1_json.clone(),
            now.clone(),
            params_fuzz_false.clone(),
            default_stability,
            default_difficulty,
        );
        let dates1_fuzz_false: serde_json::Value =
            serde_json::from_str(&result1_fuzz_false).unwrap();

        // Вычисляем следующие даты повторения для карточки 2 с fuzz=true и fuzz=false
        let result2_fuzz_true = get_next_review_dates(
            card2_json.clone(),
            now.clone(),
            params_fuzz_true.clone(),
            default_stability,
            default_difficulty,
        );
        let dates2_fuzz_true: serde_json::Value = serde_json::from_str(&result2_fuzz_true).unwrap();

        let result2_fuzz_false = get_next_review_dates(
            card2_json.clone(),
            now.clone(),
            params_fuzz_false.clone(),
            default_stability,
            default_difficulty,
        );
        let dates2_fuzz_false: serde_json::Value =
            serde_json::from_str(&result2_fuzz_false).unwrap();

        // Извлекаем даты для оценки "Good"
        let date1_fuzz_true = dates1_fuzz_true
            .get("good")
            .and_then(|v| v.as_str())
            .unwrap();
        let date1_fuzz_false = dates1_fuzz_false
            .get("good")
            .and_then(|v| v.as_str())
            .unwrap();
        let date2_fuzz_true = dates2_fuzz_true
            .get("good")
            .and_then(|v| v.as_str())
            .unwrap();
        let date2_fuzz_false = dates2_fuzz_false
            .get("good")
            .and_then(|v| v.as_str())
            .unwrap();

        // Парсим даты
        let date1_fuzz_true: chrono::DateTime<chrono::Utc> = date1_fuzz_true.parse().unwrap();
        let date1_fuzz_false: chrono::DateTime<chrono::Utc> = date1_fuzz_false.parse().unwrap();
        let date2_fuzz_true: chrono::DateTime<chrono::Utc> = date2_fuzz_true.parse().unwrap();
        let date2_fuzz_false: chrono::DateTime<chrono::Utc> = date2_fuzz_false.parse().unwrap();

        // Основная проверка: fuzz влияет на интервалы
        assert_ne!(
            date1_fuzz_true, date1_fuzz_false,
            "Fuzz should affect intervals for card1"
        );
        assert_ne!(
            date2_fuzz_true, date2_fuzz_false,
            "Fuzz should affect intervals for card2"
        );

        // Дополнительная проверка: разные карточки с fuzz=true дают разные интервалы
        assert_ne!(
            date1_fuzz_true, date2_fuzz_true,
            "Different review times should produce different intervals with fuzz enabled"
        );
    }
}
