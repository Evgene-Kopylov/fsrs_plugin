// Модуль для вычисления текущего состояния карточек FSRS

use chrono::{DateTime, Duration, Utc};

use crate::fsrs_logic::{
    card_state_label, compute_card_from_reviews, get_retrievability, memory_state_from_card,
};
use crate::json_parsing::{
    parse_card_from_json, parse_datetime_flexible, parse_parameters_from_json,
};
use crate::types::ComputedState;

/// Вычисляет текущее состояние карточки (JSON-версия).
/// Парсит строки и делегирует ядерной функции.
pub fn compute_current_state(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    let card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

    let computed_state = compute_current_state_from_card(
        &card,
        now,
        &parameters,
        default_stability,
        default_difficulty,
    );

    serde_json::to_string(&computed_state).unwrap_or_else(|_| {
        format!(
            r#"{{"due":"{}","stability":{},"difficulty":{},"state":"{}","elapsed_days":{},"scheduled_days":{},"reps":{},"lapses":{},"retrievability":{}}}"#,
            computed_state.due,
            computed_state.stability,
            computed_state.difficulty,
            computed_state.state,
            computed_state.elapsed_days,
            computed_state.scheduled_days,
            computed_state.reps,
            computed_state.lapses,
            computed_state.retrievability
        )
    })
}

/// Ядерная функция: вычисляет ComputedState из готовых структур (без JSON).
/// Используется как из JSON-версии, так и из query_cards для TTL-пересчёта.
pub fn compute_current_state_from_card(
    card: &crate::types::CardData,
    now: DateTime<Utc>,
    parameters: &crate::types::FsrsParameters,
    default_stability: f64,
    default_difficulty: f64,
) -> ComputedState {
    // Защита от NaN/Inf в дефолтных значениях
    let default_stability = if default_stability.is_finite() && default_stability > 0.0 {
        default_stability
    } else {
        2.5
    };
    let default_difficulty = if default_difficulty.is_finite() && default_difficulty > 0.0 {
        default_difficulty
    } else {
        5.0
    };

    // Полностью пересчитываем карточку через fsrs.next_states()
    let fsrs_card = compute_card_from_reviews(
        &card.reviews,
        default_stability,
        default_difficulty,
        parameters,
    );

    // Определяем дату последнего повторения
    let last_review_date = card
        .reviews
        .last()
        .and_then(|s| parse_datetime_flexible(&s.date));

    // Вычисляем elapsed_days от последнего повторения до now
    let elapsed_days_since_last = match last_review_date {
        Some(last_date) => (now - last_date).num_days().max(0) as u32,
        None => 0,
    };

    // Вычисляем due: last_review + scheduled_days
    // Для новых карточек (без повторений) due = now
    let due = match last_review_date {
        Some(last_date) => {
            let scheduled = fsrs_card.scheduled_days.max(1) as i64;
            last_date + Duration::days(scheduled)
        }
        None => now,
    };

    // Вычисляем retrievability через v6 API
    let retrievability = match memory_state_from_card(&fsrs_card) {
        Some(ms) => {
            let r = get_retrievability(ms, elapsed_days_since_last) as f64;
            if r.is_finite() && (0.0..=1.0).contains(&r) {
                r
            } else {
                1.0
            }
        }
        None => 1.0, // Новая карточка
    };

    let state_label = card_state_label(&fsrs_card);

    ComputedState {
        due: due.to_rfc3339(),
        stability: fsrs_card.stability as f64,
        difficulty: fsrs_card.difficulty as f64,
        state: state_label.to_string(),
        elapsed_days: elapsed_days_since_last as u64,
        scheduled_days: fsrs_card.scheduled_days as u64,
        reps: fsrs_card.reps as u64,
        lapses: fsrs_card.lapses as u64,
        retrievability,
    }
}

/// Проверяет, готова ли карточка к повторению
pub fn is_card_due(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    let state_json = compute_current_state(
        card_json,
        now_str.clone(),
        parameters_json,
        default_stability,
        default_difficulty,
    );

    let state: ComputedState =
        serde_json::from_str(&state_json).unwrap_or_else(|_| ComputedState {
            due: Utc::now().to_rfc3339(),
            stability: 0.0,
            difficulty: 0.0,
            state: "New".to_string(),
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            retrievability: 1.0,
        });

    let due_date: DateTime<Utc> = parse_datetime_flexible(&state.due).unwrap_or_else(Utc::now);
    let now: DateTime<Utc> = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

    let is_due = due_date <= now;

    serde_json::to_string(&is_due).unwrap_or_else(|_| "false".to_string())
}

/// Получает извлекаемость (retrievability) карточки
pub fn get_retrievability_json(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    let state_json = compute_current_state(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    );

    let state: ComputedState =
        serde_json::from_str(&state_json).unwrap_or_else(|_| ComputedState {
            due: Utc::now().to_rfc3339(),
            stability: 0.0,
            difficulty: 0.0,
            state: "New".to_string(),
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            retrievability: 1.0,
        });

    serde_json::to_string(&state.retrievability).unwrap_or_else(|_| "1.0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ComputedState;
    use chrono::{DateTime, Utc};

    fn create_test_parameters_json() -> String {
        r#"{"request_retention": 0.9, "maximum_interval": 365.0}"#.to_string()
    }

    fn create_empty_card_json() -> String {
        r#"{"reviews": []}"#.to_string()
    }

    fn create_card_with_reviews_json() -> String {
        r#"{
            "reviews": [
                {
                    "date": "2026-01-01T10:00:00Z",
                    "rating": 2
                }
            ]
        }"#
        .to_string()
    }

    #[test]
    fn test_compute_current_state_empty_card() {
        let card_json = create_empty_card_json();
        let now = "2026-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_current_state(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<ComputedState, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let state = parsed_result.unwrap();
        assert_eq!(state.state, "New");
        assert_eq!(state.stability, default_stability);
        assert_eq!(state.difficulty, default_difficulty);
        assert_eq!(state.reps, 0);
        assert_eq!(state.lapses, 0);
        assert_eq!(state.retrievability, 1.0);
    }

    #[test]
    fn test_compute_current_state_with_reviews() {
        let card_json = create_card_with_reviews_json();
        let now = "2026-01-02T14:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_current_state(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<ComputedState, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let state = parsed_result.unwrap();
        assert!(state.stability > 0.0);
        assert!(state.difficulty > 0.0);
        // Проверяем, что due позже последней сессии
        let last_review_date: DateTime<Utc> = "2026-01-01T10:00:00Z".parse().unwrap();
        let due_date: DateTime<Utc> = state.due.parse().unwrap();
        assert!(due_date > last_review_date);
    }

    #[test]
    fn test_is_card_due() {
        let card_json = create_empty_card_json();
        let now = "2026-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = is_card_due(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<bool, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());
        assert!(parsed_result.unwrap());
    }

    #[test]
    fn test_is_card_due_not_due() {
        let card_json = r#"{
            "reviews": [
                {
                    "date": "2026-01-01T10:00:00Z",
                    "rating": 2
                }
            ]
        }"#
        .to_string();

        let now = "2026-01-01T10:00:01Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = is_card_due(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<bool, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());
        assert!(!parsed_result.unwrap());
    }

    #[test]
    fn test_get_retrievability() {
        let card_json = create_card_with_reviews_json();
        let now = "2026-01-01T11:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = get_retrievability_json(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<f64, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());
        let retrievability = parsed_result.unwrap();
        assert!(retrievability > 0.0 && retrievability <= 1.0);
    }

    #[test]
    fn test_compute_current_state_invalid_json() {
        let invalid_json = r#"{invalid json}"#.to_string();
        let now = "2026-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_current_state(
            invalid_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<ComputedState, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());

        let state = parsed_result.unwrap();
        assert_eq!(state.state, "New");
        assert_eq!(state.stability, default_stability);
        assert_eq!(state.difficulty, default_difficulty);
    }
}
