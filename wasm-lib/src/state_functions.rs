// Модуль для функций работы с состоянием карточек FSRS

use chrono::{DateTime, Utc};
use rs_fsrs::{FSRS, Rating};
use serde::Serialize;

use crate::conversion::{create_fsrs_parameters, state_to_string};
use crate::fsrs_logic::create_card_from_last_session;
use crate::json_parsing::{
    parse_card_from_json, parse_datetime_flexible, parse_parameters_from_json,
};
use crate::types::{ComputedState, HistoricalState};

/// Макрос для логирования предупреждений, работает в нативных тестах.
/// В WASM не выводит ничего — ошибки обрабатываются на стороне TypeScript.
macro_rules! log_warn {
    ($($arg:tt)*) => {
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("WARN: {}", format!($($arg)*));
    };
}

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
        && let Some(last_date) = parse_datetime_flexible(&last_session.date)
    {
        let elapsed_days = (now - last_date).num_days().max(0);
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

        return serde_json::to_string(&computed_state).unwrap_or_else(|_| "{}".to_string());
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

    serde_json::to_string(&computed_state).unwrap_or_else(|_| "{}".to_string())
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

/// Вычисляет историю карточки: для каждого повторения сохраняет состояние после него,
/// извлекаемость перед ответом и на момент следующего повторения.
pub fn compute_card_history(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    use crate::conversion::rating_from_str;
    use rs_fsrs::{Card, State};

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
        // Новая карточка после первого ответа переходит в Learning, затем в Review
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
        // Для новой карточки get_retrievability() возвращает 0
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
        // Для новой карточки get_retrievability() возвращает 0
        assert_eq!(
            first.retrievability_before.unwrap(),
            0.0,
            "Для новой карточки retrievability_before = 0"
        );
        // Извлекаемость на момент второго повторения (через 9 дней)
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
        // После первого повторения карточка уже не новая — retrievability должна быть > 0
        assert!(
            retrievability_before_2 > 0.0,
            "retrievability_before второго повторения должна быть > 0, получено {}",
            retrievability_before_2
        );
        // Извлекаемость на now (через 10 дней после второго)
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

        // Второе повторение должно быть в состоянии Review (после Learning)
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
