// Модуль для вычисления истории карточки

use chrono::{DateTime, Utc};
use rs_fsrs::{Card, FSRS, State};

use crate::conversion::{create_fsrs_parameters, rating_from_str, state_to_string};
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
    // Парсим входные данные
    let card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

    // Для истории отключаем fuzz, чтобы интервалы были детерминированными
    let mut fsrs_params = create_fsrs_parameters(&parameters);
    fsrs_params.enable_fuzz = false;
    let fsrs = FSRS::new(fsrs_params);

    if card.reviews.is_empty() {
        return "[]".to_string();
    }

    let mut history: Vec<HistoricalState> = Vec::with_capacity(card.reviews.len());

    // Начальное состояние (перед первым повторением)
    let mut current_card = Card {
        stability: default_stability,
        difficulty: default_difficulty,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: State::New,
        due: now,
        last_review: now,
    };

    let mut last_review_date: Option<DateTime<Utc>> = None;

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

        // Вычисляем прошедшие дни с предыдущего повторения
        let elapsed_days = if let Some(prev_date) = last_review_date {
            (review_date - prev_date).num_days().max(0) as u64
        } else {
            0
        };
        current_card.elapsed_days = elapsed_days as i64;

        let rating = rating_from_str(&session.rating);
        let repeat_map = fsrs.repeat(current_card.clone(), review_date);
        let scheduling_info = repeat_map
            .get(&rating)
            .expect("Рейтинг должен присутствовать в repeat_map");
        let updated_card = scheduling_info.card.clone();

        // Извлекаемость перед ответом
        let retrievability_before = current_card.get_retrievability(review_date);

        // Извлекаемость на момент следующего повторения (если есть)
        let retrievability_next = if idx + 1 < card.reviews.len() {
            parse_datetime_flexible(&card.reviews[idx + 1].date)
                .map(|next_date| updated_card.get_retrievability(next_date))
        } else {
            // Последнее повторение — на текущий момент
            Some(updated_card.get_retrievability(now))
        };

        let hist_state = HistoricalState {
            date: review_date.to_rfc3339(),
            rating: Some(session.rating.clone()),
            stability: updated_card.stability,
            difficulty: updated_card.difficulty,
            state: state_to_string(updated_card.state),
            elapsed_days,
            scheduled_days: updated_card.scheduled_days as u64,
            retrievability: 1.0, // после ответа
            retrievability_before: Some(retrievability_before),
            retrievability_next,
        };
        history.push(hist_state);

        current_card = updated_card;
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
        let now = "2025-01-01T10:00:00Z".to_string();
        let params_json =
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": false}"#
                .to_string();
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
                {"date": "2025-01-01T10:00:00Z", "rating": "Good", "stability": 0.0, "difficulty": 0.0}
            ]
        }"#
        .to_string();
        let now = "2025-01-10T10:00:00Z".to_string();
        let params_json =
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": false}"#
                .to_string();
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
        assert_eq!(entry.date, "2025-01-01T10:00:00+00:00");
        assert_eq!(entry.rating.as_deref(), Some("Good"));
        assert_eq!(entry.state, "Learning");
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
        assert_eq!(
            entry.retrievability_before.unwrap(),
            0.0,
            "Для новой карточки retrievability_before = 0"
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
                {"date": "2025-01-01T10:00:00Z", "rating": "Good", "stability": 0.0, "difficulty": 0.0},
                {"date": "2025-01-10T10:00:00Z", "rating": "Good", "stability": 0.0, "difficulty": 0.0}
            ]
        }"#
        .to_string();
        let now = "2025-01-20T10:00:00Z".to_string();
        let params_json =
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": false}"#
                .to_string();
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

        // Проверяем первую запись
        let first = &history[0];
        assert_eq!(first.date, "2025-01-01T10:00:00+00:00");
        assert_eq!(first.rating.as_deref(), Some("Good"));
        assert_eq!(
            first.elapsed_days, 0,
            "Первое повторение — elapsed_days = 0"
        );
        assert_eq!(first.retrievability, 1.0);
        assert_eq!(
            first.retrievability_before.unwrap(),
            0.0,
            "Для новой карточки retrievability_before = 0"
        );
        let retrievability_next_1 = first.retrievability_next.unwrap();
        assert!(
            retrievability_next_1 > 0.0 && retrievability_next_1 < 1.0,
            "retrievability_next между 0 и 1, получено {}",
            retrievability_next_1
        );

        // Проверяем вторую запись
        let second = &history[1];
        assert_eq!(second.date, "2025-01-10T10:00:00+00:00");
        assert_eq!(second.rating.as_deref(), Some("Good"));
        assert_eq!(second.elapsed_days, 9, "Между повторениями 9 дней");
        assert_eq!(second.retrievability, 1.0);
        let retrievability_before_2 = second.retrievability_before.unwrap();
        assert!(
            retrievability_before_2 > 0.0,
            "retrievability_before второго повторения должна быть > 0, получено {}",
            retrievability_before_2
        );
        let retrievability_next_2 = second.retrievability_next.unwrap();
        assert!(
            retrievability_next_2 > 0.0 && retrievability_next_2 < 1.0,
            "retrievability_next между 0 и 1, получено {}",
            retrievability_next_2
        );

        // Стабильность должна расти
        assert!(
            second.stability > first.stability,
            "Стабильность должна расти: {} -> {}",
            first.stability,
            second.stability
        );

        assert_eq!(
            second.state, "Review",
            "После двух Good карточка должна быть в Review"
        );
    }

    #[test]
    fn test_compute_card_history_invalid_date_skipped() {
        let card_json = r#"{
            "reviews": [
                {"date": "2025-01-01T10:00:00Z", "rating": "Good", "stability": 0.0, "difficulty": 0.0},
                {"date": "invalid-date", "rating": "Hard", "stability": 0.0, "difficulty": 0.0},
                {"date": "2025-01-10T10:00:00Z", "rating": "Good", "stability": 0.0, "difficulty": 0.0}
            ]
        }"#
        .to_string();
        let now = "2025-01-20T10:00:00Z".to_string();
        let params_json =
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": false}"#
                .to_string();
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

        assert_eq!(history[0].rating.as_deref(), Some("Good"));
        assert_eq!(history[1].rating.as_deref(), Some("Good"));
    }
}
