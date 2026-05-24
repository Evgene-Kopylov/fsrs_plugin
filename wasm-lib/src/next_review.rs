// Модуль для вычисления следующих дат повторения

use chrono::{Duration, Utc};
use serde::Serialize;

use crate::fsrs_logic::{compute_card_from_reviews, memory_state_from_card};
use crate::fsrs_schedule;
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

    // Пересчитываем состояние карточки
    let fsrs_card = compute_card_from_reviews(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    let retention = parameters.request_retention as f32;

    // Определяем elapsed_days от последнего повторения до now
    let elapsed_days = card
        .reviews
        .last()
        .and_then(|s| parse_datetime_flexible(&s.date))
        .map(|last_date| (now - last_date).num_days().max(0) as u32)
        .unwrap_or(0);

    // Получаем следующие состояния
    let current_state = memory_state_from_card(&fsrs_card);
    let next = fsrs_schedule::next_states(current_state, retention, elapsed_days, &parameters.w);

    let mk_date = |interval: f32| -> String {
        let days = interval.round().max(1.0) as i64;
        (now + Duration::days(days)).to_rfc3339()
    };

    let result = NextReviewDates {
        again: Some(mk_date(next.again.interval)),
        hard: Some(mk_date(next.hard.interval)),
        good: Some(mk_date(next.good.interval)),
        easy: Some(mk_date(next.easy.interval)),
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::DateTime;

    fn create_test_parameters_json() -> String {
        r#"{"request_retention": 0.9, "maximum_interval": 365.0}"#.to_string()
    }

    fn create_empty_card_json() -> String {
        r#"{"reviews": []}"#.to_string()
    }

    #[test]
    fn test_get_next_review_dates() {
        let card_json = create_empty_card_json();
        let now = "2026-01-01T12:00:00Z".to_string();
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
        assert!(dates.get("again").is_some());
        assert!(dates.get("hard").is_some());
        assert!(dates.get("good").is_some());
        assert!(dates.get("easy").is_some());

        // Проверяем, что даты валидные и в будущем относительно now
        let now_dt: DateTime<Utc> = "2026-01-01T12:00:00Z".parse().unwrap();
        for key in &["again", "hard", "good", "easy"] {
            let date_str = dates[key].as_str().unwrap();
            let date_dt: DateTime<Utc> = date_str.parse().unwrap();
            assert!(date_dt > now_dt, "{} should be in the future", key);
        }
    }
}
