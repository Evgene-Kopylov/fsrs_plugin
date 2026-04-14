// Модуль для функций работы с состоянием карточек FSRS

use rs_fsrs::{FSRS, Rating};
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::types::ComputedState;
use crate::conversion::{create_fsrs_parameters, state_to_string};
use crate::fsrs_logic::create_card_from_last_session;
use crate::json_parsing::{parse_card_from_json, parse_parameters_from_json, parse_datetime_from_iso};

/// Вычисляет текущее состояние карточки
pub fn compute_current_state(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим входные данные
    let card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_from_iso(&now_str);

    // Создаем Card для алгоритма FSRS из истории reviews
    let mut fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Получаем последнюю сессию (если есть)
    let last_session = card.reviews.last();

    // Если есть последняя сессия, обновляем elapsed_days
    if let Some(last_session) = last_session
        && let Ok(last_date) = last_session.date.parse::<DateTime<Utc>>() {
            let elapsed_days = (now - last_date).num_days().max(0) as i64;
            fsrs_card.elapsed_days = elapsed_days;
            fsrs_card.last_review = last_date;

            // Рассчитываем извлекаемость
            let retrievability = fsrs_card.get_retrievability(now);

            // Создаем вычисляемое состояние
            let computed_state = ComputedState {
                due: fsrs_card.due.to_rfc3339(),
                stability: fsrs_card.stability,
                difficulty: fsrs_card.difficulty,
                state: state_to_string(fsrs_card.state),
                elapsed_days: fsrs_card.elapsed_days as u64,
                scheduled_days: fsrs_card.scheduled_days as u64,
                reps: fsrs_card.reps as u64,
                lapses: fsrs_card.lapses as u64,
                retrievability,
            };

            return serde_json::to_string(&computed_state)
                .unwrap_or_else(|_| "{}".to_string());
        }

    // Если нет сессий, возвращаем дефолтное состояние
    let computed_state = ComputedState {
        due: now.to_rfc3339(),
        stability: default_stability,
        difficulty: default_difficulty,
        state: "New".to_string(),
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        retrievability: 1.0,
    };

    serde_json::to_string(&computed_state)
        .unwrap_or_else(|_| "{}".to_string())
}

/// Проверяет, готова ли карточка к повторению
pub fn is_card_due(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Вычисляем текущее состояние
    let state_json = compute_current_state(
        card_json,
        now_str.clone(),
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим состояние
    let state: ComputedState = serde_json::from_str(&state_json)
        .unwrap_or_else(|_| {
            ComputedState {
                due: Utc::now().to_rfc3339(),
                stability: 0.0,
                difficulty: 0.0,
                state: "New".to_string(),
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                retrievability: 1.0,
            }
        });

    // Проверяем, просрочена ли карточка
    let due_date: DateTime<Utc> = state.due.parse()
        .unwrap_or_else(|_| Utc::now());
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| Utc::now());

    let is_due = due_date <= now;

    // Возвращаем результат в формате JSON
    serde_json::to_string(&is_due)
        .unwrap_or_else(|_| "false".to_string())
}

/// Получает извлекаемость (retrievability) карточки
pub fn get_retrievability(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Вычисляем текущее состояние
    let state_json = compute_current_state(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим состояние
    let state: ComputedState = serde_json::from_str(&state_json)
        .unwrap_or_else(|_| {
            ComputedState {
                due: Utc::now().to_rfc3339(),
                stability: 0.0,
                difficulty: 0.0,
                state: "New".to_string(),
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                retrievability: 1.0,
            }
        });

    // Возвращаем извлекаемость в формате JSON
    serde_json::to_string(&state.retrievability)
        .unwrap_or_else(|_| "1.0".to_string())
}

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
    let now = parse_datetime_from_iso(&now_str);

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
    serde_json::to_string(&result)
        .unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};
    use serde_json;

    use crate::types::ComputedState;

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
    fn test_compute_current_state_empty_card() {
        let card_json = create_empty_card_json();
        let now = "2025-01-01T12:00:00Z".to_string();
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
        let now = "2025-01-02T14:00:00Z".to_string();
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
        let last_review_date: DateTime<Utc> = "2025-01-01T10:00:00Z".parse().unwrap();
        let due_date: DateTime<Utc> = state.due.parse().unwrap();
        assert!(due_date > last_review_date);
    }

    #[test]
    fn test_is_card_due() {
        // Тест для карточки без сессий (новая)
        let card_json = create_empty_card_json();
        let now = "2025-01-01T12:00:00Z".to_string();
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
        assert!(parsed_result.unwrap()); // Новая карточка готова к повторению
    }

    #[test]
    fn test_is_card_due_not_due() {
        // Карточка с reviews, но дата следующего повторения в будущем
        let card_json = r#"{
            "reviews": [
                {
                    "date": "2025-01-01T10:00:00Z",
                    "rating": "Good",
                    "stability": 2.0,
                    "difficulty": 3.0
                }
            ]
        }"#.to_string();

        let now = "2025-01-02T10:00:00Z".to_string(); // Через 1 день после последнего повторения
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = is_card_due(
            card_json.clone(),
            now.clone(),
            params_json.clone(),
            default_stability,
            default_difficulty,
        );

        // Отладочная печать состояния карточки
        let _state_result = compute_current_state(
            card_json,
            now,
            params_json,
            default_stability,
            default_difficulty,
        );

        let parsed_result: Result<bool, _> = serde_json::from_str(&result);
        assert!(parsed_result.is_ok());
        let is_due = parsed_result.unwrap();
        // Карточка не должна быть готова к повторению (ещё 1 день до due)
        assert!(!is_due, "Карточка не должна быть готова к повторению, но is_due = {}", is_due);
    }

    #[test]
    fn test_get_retrievability() {
        let card_json = create_card_with_reviews_json();
        let now = "2025-01-01T11:00:00Z".to_string(); // Через час после повторения
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let result = get_retrievability(
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
    fn test_compute_current_state_invalid_json() {
        let invalid_json = r#"{invalid json}"#.to_string();
        let now = "2025-01-01T12:00:00Z".to_string();
        let params_json = create_test_parameters_json();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        // Не должно паниковать, должно вернуть дефолтное состояние
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
