// Модуль для вычисления текущего состояния карточек FSRS

use chrono::{DateTime, Utc};

use crate::conversion::state_to_string;
use crate::fsrs_logic::compute_card_from_reviews;
use crate::json_parsing::{
    parse_card_from_json, parse_datetime_flexible, parse_parameters_from_json,
};
use crate::types::ComputedState;
use rs_fsrs::State;

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
    let now = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

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

    // Полностью пересчитываем карточку через fsrs.repeat()
    // с текущими w-параметрами FSRS
    let mut fsrs_card = compute_card_from_reviews(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
        now,
        parameters.enable_fuzz,
    );

    // Если есть повторения, обновляем elapsed_days от последнего до now
    if let Some(last_session) = card.reviews.last() {
        if let Some(last_date) = parse_datetime_flexible(&last_session.date) {
            let elapsed_days = (now - last_date).num_days().max(0);
            fsrs_card.elapsed_days = elapsed_days;
            fsrs_card.last_review = last_date;
        }
    }

    // Защита от NaN/Inf в значениях карточки после расчёта
    let stability = if fsrs_card.stability.is_finite() && fsrs_card.stability >= 0.0 {
        fsrs_card.stability
    } else {
        default_stability
    };
    let difficulty = if fsrs_card.difficulty.is_finite() && fsrs_card.difficulty >= 0.0 {
        fsrs_card.difficulty
    } else {
        default_difficulty
    };

    // Рассчитываем извлекаемость
    // Для новой карточки (без повторений) rs-fsrs возвращает 0, но должна быть 1.0
    let retrievability = if fsrs_card.state == State::New {
        1.0
    } else {
        let r = fsrs_card.get_retrievability(now);
        if r.is_finite() && (0.0..=1.0).contains(&r) {
            r
        } else {
            1.0
        }
    };

    // Создаем вычисляемое состояние
    let computed_state = ComputedState {
        due: fsrs_card.due.to_rfc3339(),
        stability,
        difficulty,
        state: state_to_string(fsrs_card.state),
        elapsed_days: fsrs_card.elapsed_days.max(0) as u64,
        scheduled_days: fsrs_card.scheduled_days.max(0) as u64,
        reps: fsrs_card.reps.max(0) as u64,
        lapses: fsrs_card.lapses.max(0) as u64,
        retrievability,
    };

    // Сериализация с запасным вариантом на случай невалидных чисел
    match serde_json::to_string(&computed_state) {
        Ok(json) => json,
        Err(_) => {
            // Ручное создание JSON при ошибке сериализации
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
        }
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
    // Вычисляем текущее состояние
    let state_json = compute_current_state(
        card_json,
        now_str.clone(),
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим состояние
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

    // Проверяем, просрочена ли карточка
    let due_date: DateTime<Utc> = parse_datetime_flexible(&state.due).unwrap_or_else(Utc::now);
    let now: DateTime<Utc> = parse_datetime_flexible(&now_str).unwrap_or_else(Utc::now);

    let is_due = due_date <= now;

    // Возвращаем результат в формате JSON
    serde_json::to_string(&is_due).unwrap_or_else(|_| "false".to_string())
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

    // Возвращаем извлекаемость в формате JSON
    serde_json::to_string(&state.retrievability).unwrap_or_else(|_| "1.0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ComputedState;
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
        }"#
        .to_string()
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
        }"#
        .to_string();

        let now = "2025-01-01T10:00:01Z".to_string(); // Сразу после повторения — due ещё в будущем
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
        // Карточка не должна быть готова к повторению (due после repeat > now)
        assert!(
            !is_due,
            "Карточка не должна быть готова к повторению, но is_due = {}",
            is_due
        );
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
