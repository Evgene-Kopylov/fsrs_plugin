// Модуль для вычисления истории карточки

use crate::fsrs_schedule::MemoryState;
use chrono::{DateTime, Utc};

use crate::conversion::{rating_to_u32, state_label};
use crate::json_parsing::{
    parse_card_from_json, parse_datetime_flexible, parse_parameters_from_json,
};
use crate::log_warn;
use crate::types::HistoricalState;

/// Вычисляет историю карточки: для каждого повторения сохраняет состояние после него,
/// извлекаемость перед ответом и на момент следующего повторения.
pub fn compute_card_history(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    let card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

    if card.reviews.is_empty() {
        return "[]".to_string();
    }

    let retention = parameters.request_retention as f32;

    let mut history: Vec<HistoricalState> = Vec::with_capacity(card.reviews.len());

    let mut state: Option<MemoryState> = None;
    let mut last_review_date: Option<DateTime<Utc>> = None;
    let mut reps: u32 = 0;

    for (idx, session) in card.reviews.iter().enumerate() {
        let review_date = match parse_datetime_flexible(&session.date) {
            Some(dt) => dt,
            None => {
                log_warn!(
                    "Неверный формат даты в повторении {}: {}",
                    idx,
                    session.date
                );
                continue;
            }
        };

        let elapsed_days = if let Some(prev_date) = last_review_date {
            (review_date - prev_date).num_days().max(0) as u32
        } else {
            0
        };

        // Извлекаемость перед ответом
        let retrievability_before = state.map(|s| {
            let r = crate::fsrs_schedule::current_retrievability(s, elapsed_days as f32);
            if r.is_finite() && (0.0..=1.0).contains(&r) {
                r
            } else {
                0.0
            }
        });

        let rating = rating_to_u32(session.rating);
        let next = crate::fsrs_schedule::next_states(state, retention, elapsed_days, &parameters.w);

        let item_state = match rating {
            1 => &next.again,
            2 => &next.hard,
            3 => &next.good,
            4 => &next.easy,
            _ => continue,
        };

        let new_state = item_state.memory;
        reps += 1;

        // Извлекаемость на момент следующего повторения
        let retrievability_next = if idx + 1 < card.reviews.len() {
            parse_datetime_flexible(&card.reviews[idx + 1].date).map(|next_date| {
                let days_to_next = (next_date - review_date).num_days().max(0) as u32;
                let r =
                    crate::fsrs_schedule::current_retrievability(new_state, days_to_next as f32);
                if r.is_finite() && (0.0..=1.0).contains(&r) {
                    r
                } else {
                    1.0
                }
            })
        } else {
            // Последнее повторение — на текущий момент
            let days_to_now = (now - review_date).num_days().max(0) as u32;
            let r = crate::fsrs_schedule::current_retrievability(new_state, days_to_now as f32);
            Some(if r.is_finite() && (0.0..=1.0).contains(&r) {
                r
            } else {
                1.0
            })
        };

        let stability = if new_state.stability.is_finite() {
            new_state.stability
        } else {
            default_stability as f32
        };
        let difficulty = if new_state.difficulty.is_finite() {
            new_state.difficulty
        } else {
            default_difficulty as f32
        };

        let scheduled_days = item_state.interval.round().max(1.0) as u32;

        let hist_state = HistoricalState {
            date: review_date.to_rfc3339(),
            rating: Some(session.rating),
            stability: stability as f64,
            difficulty: difficulty as f64,
            state: state_label(reps as usize, stability, Some(rating)).to_string(),
            elapsed_days: elapsed_days as u64,
            scheduled_days: scheduled_days as u64,
            retrievability: 1.0, // после ответа
            retrievability_before: retrievability_before.map(|r| r as f64),
            retrievability_next: retrievability_next.map(|r| r as f64),
        };
        history.push(hist_state);

        state = Some(new_state);
        last_review_date = Some(review_date);
    }

    serde_json::to_string(&history).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::HistoricalState;

    #[test]
    fn test_compute_card_history_empty_card() {
        let card_json = r#"{"reviews": []}"#.to_string();
        let now = "2026-01-01T10:00:00Z".to_string();
        let params_json = r#"{"request_retention": 0.9, "maximum_interval": 36500.0}"#.to_string();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_card_history(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );
        assert_eq!(result, "[]");
    }

    #[test]
    fn test_compute_card_history_single_review() {
        let card_json = r#"{
            "reviews": [
                {"date": "2026-01-01T10:00:00Z", "rating": 2}
            ]
        }"#
        .to_string();
        let now = "2026-01-10T10:00:00Z".to_string();
        let params_json = r#"{"request_retention": 0.9, "maximum_interval": 36500.0}"#.to_string();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_card_history(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );
        let history: Vec<HistoricalState> =
            serde_json::from_str(&result).expect("Должен парситься в массив HistoricalState");

        assert_eq!(history.len(), 1, "Должна быть одна запись");

        let entry = &history[0];
        assert_eq!(entry.date, "2026-01-01T10:00:00+00:00");
        assert_eq!(entry.rating, Some(2u8));
        assert_eq!(entry.elapsed_days, 0);
        assert!(
            entry.stability > 0.0,
            "Стабильность должна быть установлена"
        );
        assert!(entry.difficulty > 0.0, "Сложность должна быть установлена");
        assert_eq!(
            entry.retrievability, 1.0,
            "После ответа retrievability = 1.0"
        );
        assert!(
            entry.retrievability_next.is_some(),
            "Должна быть retrievability_next на now"
        );
    }

    #[test]
    fn test_compute_card_history_two_reviews() {
        let card_json = r#"{
            "reviews": [
                {"date": "2026-01-01T10:00:00Z", "rating": 2},
                {"date": "2026-01-10T10:00:00Z", "rating": 2}
            ]
        }"#
        .to_string();
        let now = "2026-01-20T10:00:00Z".to_string();
        let params_json = r#"{"request_retention": 0.9, "maximum_interval": 36500.0}"#.to_string();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_card_history(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );
        let history: Vec<HistoricalState> =
            serde_json::from_str(&result).expect("Должен парситься в массив HistoricalState");

        assert_eq!(history.len(), 2, "Должно быть две записи");

        let first = &history[0];
        assert_eq!(first.date, "2026-01-01T10:00:00+00:00");
        assert_eq!(first.rating, Some(2u8));
        assert_eq!(
            first.elapsed_days, 0,
            "Первое повторение — elapsed_days = 0"
        );
        assert_eq!(first.retrievability, 1.0);

        let second = &history[1];
        assert_eq!(second.date, "2026-01-10T10:00:00+00:00");
        assert_eq!(second.rating, Some(2u8));
        assert_eq!(second.elapsed_days, 9, "Между повторениями 9 дней");
        assert_eq!(second.retrievability, 1.0);

        assert!(
            second.stability > first.stability,
            "Стабильность должна расти: {} -> {}",
            first.stability,
            second.stability
        );
    }

    #[test]
    fn test_compute_card_history_invalid_date_skipped() {
        let card_json = r#"{
            "reviews": [
                {"date": "2026-01-01T10:00:00Z", "rating": 2},
                {"date": "invalid-date", "rating": 1},
                {"date": "2026-01-10T10:00:00Z", "rating": 2}
            ]
        }"#
        .to_string();
        let now = "2026-01-20T10:00:00Z".to_string();
        let params_json = r#"{"request_retention": 0.9, "maximum_interval": 36500.0}"#.to_string();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = compute_card_history(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );
        let history: Vec<HistoricalState> =
            serde_json::from_str(&result).expect("Должен парситься в массив HistoricalState");

        // Невалидная дата должна быть пропущена, должно быть 2 записи вместо 3
        assert_eq!(history.len(), 2, "Невалидная дата должна быть пропущена");

        assert_eq!(history[0].rating, Some(2u8));
        assert_eq!(history[1].rating, Some(2u8));
    }
}
