use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::json_parsing::{parse_datetime_flexible, parse_parameters_from_json};
use crate::state_functions::compute_current_state;
use crate::types::{FsrsParameters, ModernFsrsCard};

/// Вспомогательная структура для результатов вычислений
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ComputedCardResult {
    card: ModernFsrsCard,
    due: String, // ISO 8601 строка
    stability: f64,
    difficulty: f64,
    state: String, // "New", "Learning", "Review", "Relearning"
    elapsed_days: u64,
    scheduled_days: u64,
    reps: u64,
    lapses: u64,
    retrievability: f64,
    priority_score: f64,
}

/// Вычисляет состояния для массива карточек
fn compute_cards_states(
    cards: Vec<ModernFsrsCard>,
    parameters: &FsrsParameters,
    now: DateTime<Utc>,
    default_stability: f64,
    default_difficulty: f64,
) -> Vec<ComputedCardResult> {
    let parameters_json = serde_json::to_string(parameters).unwrap_or_else(|_| {
        r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
            .to_string()
    });
    let now_str = now.to_rfc3339();

    cards
        .into_iter()
        .filter_map(|card| {
            let card_json = serde_json::to_string(&card).ok()?;

            // Вычисляем состояние карточки
            let state_json = compute_current_state(
                card_json.clone(),
                now_str.clone(),
                parameters_json.clone(),
                default_stability,
                default_difficulty,
            );

            // Парсим результат
            let state: serde_json::Value = serde_json::from_str(&state_json).ok()?;

            let due_str = state.get("due")?.as_str()?.to_string();
            let stability = state.get("stability")?.as_f64()?;
            let difficulty = state.get("difficulty")?.as_f64()?;
            let state_str = state.get("state")?.as_str()?.to_string();
            let elapsed_days = state.get("elapsed_days")?.as_u64()?;
            let scheduled_days = state.get("scheduled_days")?.as_u64()?;
            let reps = state.get("reps")?.as_u64()?;
            let lapses = state.get("lapses")?.as_u64()?;
            let retrievability = state.get("retrievability")?.as_f64()?;

            // Рассчитываем оценку приоритета
            let due_date: DateTime<Utc> = due_str.parse().ok()?;
            let priority_score = calculate_priority_score(due_date, retrievability, now);

            Some(ComputedCardResult {
                card,
                due: due_str,
                stability,
                difficulty,
                state: state_str,
                elapsed_days,
                scheduled_days,
                reps,
                lapses,
                retrievability,
                priority_score,
            })
        })
        .collect()
}

/// Рассчитывает оценку приоритета карточки
fn calculate_priority_score(
    due_date: DateTime<Utc>,
    retrievability: f64,
    now: DateTime<Utc>,
) -> f64 {
    // Приоритет: сначала просроченные, затем по извлекаемости (меньше = выше приоритет)
    let is_overdue = due_date <= now;
    let priority_base = if is_overdue { 0.0 } else { 1.0 };
    priority_base * 1_000_000.0 + retrievability * 1_000.0
}

/// Фильтрует карточки для повторения
pub fn filter_cards_for_review(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> String {
    let result = filter_cards_for_review_internal(cards_json, settings_json, now_iso);
    serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
}

/// Внутренняя реализация фильтрации карточек
fn filter_cards_for_review_internal(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> Vec<ModernFsrsCard> {
    // Парсим входные данные
    let cards: Vec<ModernFsrsCard> = match serde_json::from_str(&cards_json) {
        Ok(cards) => cards,
        Err(e) => {
            eprintln!("Ошибка парсинга карточек: {}", e);
            return Vec::new();
        }
    };

    let settings: serde_json::Value = match serde_json::from_str(&settings_json) {
        Ok(settings) => settings,
        Err(e) => {
            eprintln!("Ошибка парсинга настроек: {}", e);
            return Vec::new();
        }
    };

    let now = parse_datetime_flexible(&now_iso).unwrap_or_else(Utc::now);

    // Извлекаем параметры из настроек
    let parameters = parse_parameters_from_json(
        settings
            .get("parameters")
            .and_then(|p| serde_json::to_string(p).ok())
            .unwrap_or_else(|| {
                r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
                    .to_string()
            })
            .as_str(),
    );

    let default_stability = settings
        .get("default_initial_stability")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let default_difficulty = settings
        .get("default_initial_difficulty")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    // Вычисляем состояния всех карточек
    let computed_cards = compute_cards_states(
        cards,
        &parameters,
        now,
        default_stability,
        default_difficulty,
    );

    // Фильтруем карточки, которые готовы к повторению (просроченные или с низкой извлекаемостью)
    computed_cards
        .into_iter()
        .filter(|computed| {
            // Карточка готова к повторению, если она просрочена
            let due_date: DateTime<Utc> = match computed.due.parse() {
                Ok(date) => date,
                Err(_) => return false, // Если не удалось парсить дату, пропускаем
            };

            due_date <= now
        })
        .map(|computed| computed.card)
        .collect()
}

/// Сортирует карточки по приоритету
pub fn sort_cards_by_priority(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> String {
    let result = sort_cards_by_priority_internal(cards_json, settings_json, now_iso);
    serde_json::to_string(&result).unwrap_or_else(|_| "[]".to_string())
}

/// Внутренняя реализация сортировки карточек
fn sort_cards_by_priority_internal(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> Vec<ModernFsrsCard> {
    // Парсим входные данные
    let cards: Vec<ModernFsrsCard> = match serde_json::from_str(&cards_json) {
        Ok(cards) => cards,
        Err(e) => {
            eprintln!("Ошибка парсинга карточек: {}", e);
            return Vec::new();
        }
    };

    let settings: serde_json::Value = match serde_json::from_str(&settings_json) {
        Ok(settings) => settings,
        Err(e) => {
            eprintln!("Ошибка парсинга настроек: {}", e);
            return Vec::new();
        }
    };

    let now = parse_datetime_flexible(&now_iso).unwrap_or_else(Utc::now);

    // Извлекаем параметры из настроек
    let parameters = parse_parameters_from_json(
        settings
            .get("parameters")
            .and_then(|p| serde_json::to_string(p).ok())
            .unwrap_or_else(|| {
                r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
                    .to_string()
            })
            .as_str(),
    );

    let default_stability = settings
        .get("default_initial_stability")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let default_difficulty = settings
        .get("default_initial_difficulty")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    // Вычисляем состояния всех карточек
    let mut computed_cards = compute_cards_states(
        cards,
        &parameters,
        now,
        default_stability,
        default_difficulty,
    );

    // Сортируем по оценке приоритета (меньше = выше приоритет)
    computed_cards.sort_by(|a, b| {
        a.priority_score
            .partial_cmp(&b.priority_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    computed_cards
        .into_iter()
        .map(|computed| computed.card)
        .collect()
}

/// Группирует карточки по состоянию
pub fn group_cards_by_state(cards_json: String, settings_json: String, now_iso: String) -> String {
    let result = group_cards_by_state_internal(cards_json, settings_json, now_iso);
    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

/// Структура для группировки карточек
#[derive(Debug, Serialize, Deserialize)]
struct GroupedCards {
    overdue: Vec<ModernFsrsCard>,
    due: Vec<ModernFsrsCard>,
    not_due: Vec<ModernFsrsCard>,
}

/// Внутренняя реализация группировки карточек
fn group_cards_by_state_internal(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> GroupedCards {
    let mut result = GroupedCards {
        overdue: Vec::new(),
        due: Vec::new(),
        not_due: Vec::new(),
    };

    // Парсим входные данные
    let cards: Vec<ModernFsrsCard> = match serde_json::from_str(&cards_json) {
        Ok(cards) => cards,
        Err(e) => {
            eprintln!("Ошибка парсинга карточек: {}", e);
            return result;
        }
    };

    let settings: serde_json::Value = match serde_json::from_str(&settings_json) {
        Ok(settings) => settings,
        Err(e) => {
            eprintln!("Ошибка парсинга настроек: {}", e);
            return result;
        }
    };

    let now = parse_datetime_flexible(&now_iso).unwrap_or_else(Utc::now);

    // Извлекаем параметры из настроек
    let parameters = parse_parameters_from_json(
        settings
            .get("parameters")
            .and_then(|p| serde_json::to_string(p).ok())
            .unwrap_or_else(|| {
                r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
                    .to_string()
            })
            .as_str(),
    );

    let default_stability = settings
        .get("default_initial_stability")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let default_difficulty = settings
        .get("default_initial_difficulty")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    // Вычисляем состояния всех карточек
    let computed_cards = compute_cards_states(
        cards,
        &parameters,
        now,
        default_stability,
        default_difficulty,
    );

    // Группируем карточки
    for computed in computed_cards {
        let due_date: DateTime<Utc> = match computed.due.parse() {
            Ok(date) => date,
            Err(_) => continue, // Если не удалось парсить дату, пропускаем
        };

        if due_date <= now {
            // Просроченные
            result.overdue.push(computed.card);
        } else if computed.state == "New" || computed.state == "Review" {
            // Готовы к повторению (новые или в режиме повторения)
            result.due.push(computed.card);
        } else {
            // Не готовы к повторению
            result.not_due.push(computed.card);
        }
    }

    result
}

/// Функции для работы со временем
/// Рассчитывает время просрочки карточки в часах
pub fn get_overdue_hours(due_iso: String, now_iso: String) -> String {
    web_sys::console::log_1(&format!("get_overdue_hours called: due_iso={}, now_iso={}", due_iso, now_iso).into());

    let result = match (
        parse_datetime_flexible(&due_iso),
        parse_datetime_flexible(&now_iso),
    ) {
        (Some(due_date), Some(now)) => {
            web_sys::console::log_1(&format!("Dates parsed successfully: due_date={:?}, now={:?}", due_date, now).into());

            let diff_ms = now.timestamp_millis() - due_date.timestamp_millis();
            web_sys::console::log_1(&format!("diff_ms = {} (now {} - due {})", diff_ms, now.timestamp_millis(), due_date.timestamp_millis()).into());

            let hours = (diff_ms as f64 / (1000.0 * 60.0 * 60.0)).floor();
            web_sys::console::log_1(&format!("overdue_hours = {} (diff_ms / (1000*60*60))", hours).into());

            hours
        }
        _ => {
            web_sys::console::log_1(&"Failed to parse dates, returning 0.0".into());
            0.0
        },
    };

    let json_result = serde_json::to_string(&result).unwrap_or_else(|_| "0.0".to_string());
    web_sys::console::log_1(&format!("get_overdue_hours returning: {}", json_result).into());
    json_result
}

/// Рассчитывает оставшееся время до повторения карточки в часах
/// Возвращает отрицательное значение если карточка просрочена
pub fn get_hours_until_due(due_iso: String, now_iso: String) -> String {
    let result = match (
        parse_datetime_flexible(&due_iso),
        parse_datetime_flexible(&now_iso),
    ) {
        (Some(due_date), Some(now)) => {
            let diff_ms = due_date.timestamp_millis() - now.timestamp_millis();
            diff_ms as f64 / (1000.0 * 60.0 * 60.0)
        }
        _ => 0.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "0.0".to_string())
}

/// Проверяет, просрочена ли карточка
pub fn is_card_overdue(due_iso: String, now_iso: String) -> String {
    let result = match (
        parse_datetime_flexible(&due_iso),
        parse_datetime_flexible(&now_iso),
    ) {
        (Some(due_date), Some(now)) => due_date <= now,
        _ => false,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "false".to_string())
}

/// Рассчитывает возраст карточки в днях (от первого повторения или создания)
pub fn get_card_age_days(card_json: String, now_iso: String) -> String {
    let result = match (
        serde_json::from_str::<ModernFsrsCard>(&card_json),
        parse_datetime_flexible(&now_iso),
    ) {
        (Ok(card), Some(now)) => {
            if card.reviews.is_empty() {
                0.0 // Новая карточка
            } else {
                match parse_datetime_flexible(&card.reviews[0].date) {
                    Some(first_review_date) => {
                        let diff_ms = now.timestamp_millis() - first_review_date.timestamp_millis();
                        (diff_ms as f64 / (1000.0 * 60.0 * 60.0 * 24.0))
                            .floor()
                            .max(0.0)
                    }
                    None => 0.0,
                }
            }
        }
        _ => 0.0,
    };

    serde_json::to_string(&result).unwrap_or_else(|_| "0.0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_calculate_priority_score() {
        let now = Utc::now();

        // Просроченная карточка с низкой извлекаемостью
        let past = now - chrono::Duration::days(1);
        let score1 = calculate_priority_score(past, 0.2, now);

        // Просроченная карточка с высокой извлекаемостью
        let score2 = calculate_priority_score(past, 0.9, now);

        // Непросроченная карточка
        let future = now + chrono::Duration::days(1);
        let score3 = calculate_priority_score(future, 0.5, now);

        // Просроченные должны иметь более высокий приоритет (меньший score)
        assert!(score1 < 1_000_000.0);
        assert!(score2 < 1_000_000.0);

        // Непросроченные должны иметь более низкий приоритет (больший score)
        assert!(score3 >= 1_000_000.0);

        // Среди просроченных, карточка с более низкой извлекаемостью должна иметь более высокий приоритет
        assert!(score1 < score2);
    }

    #[test]
    fn test_is_card_overdue() {
        let now = Utc::now();
        let past = now - chrono::Duration::hours(1);
        let future = now + chrono::Duration::hours(1);

        let past_str = past.to_rfc3339();
        let future_str = future.to_rfc3339();
        let now_str = now.to_rfc3339();

        let result1 = is_card_overdue(past_str.clone(), now_str.clone());
        let result2 = is_card_overdue(future_str.clone(), now_str.clone());

        let overdue1: bool = serde_json::from_str(&result1).unwrap();
        let overdue2: bool = serde_json::from_str(&result2).unwrap();

        assert!(overdue1);
        assert!(!overdue2);
    }

    #[test]
    fn test_get_overdue_hours() {
        let now = Utc::now();
        let past = now - chrono::Duration::hours(5);

        let past_str = past.to_rfc3339();
        let now_str = now.to_rfc3339();

        let result = get_overdue_hours(past_str, now_str);
        let hours: f64 = serde_json::from_str(&result).unwrap();

        assert!((hours - 5.0).abs() < 0.1); // Примерно 5 часов
    }

    #[test]
    fn test_get_hours_until_due() {
        let now = Utc::now();
        let future = now + chrono::Duration::hours(3);

        let future_str = future.to_rfc3339();
        let now_str = now.to_rfc3339();
        let now_str_clone = now_str.clone();

        let result = get_hours_until_due(future_str, now_str_clone.clone());
        let hours: f64 = serde_json::from_str(&result).unwrap();

        assert!((hours - 3.0).abs() < 0.1); // Примерно 3 часа

        // Просроченная карточка должна возвращать отрицательное значение
        let past = now - chrono::Duration::hours(2);
        let past_str = past.to_rfc3339();

        let result2 = get_hours_until_due(past_str, now_str_clone.clone());
        let hours2: f64 = serde_json::from_str(&result2).unwrap();

        assert!(hours2 < 0.0);
    }
}
