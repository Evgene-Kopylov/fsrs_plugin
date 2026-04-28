use chrono::{DateTime, Utc};

use crate::json_parsing::parse_datetime_flexible;
use crate::types::ModernFsrsCard;

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

/// Функции для работы со временем
/// Рассчитывает время просрочки карточки в часах
pub fn get_overdue_hours(due_iso: String, now_iso: String) -> String {
    log::debug!(
        "get_overdue_hours called: due_iso={}, now_iso={}",
        due_iso,
        now_iso
    );

    let result = match (
        parse_datetime_flexible(&due_iso),
        parse_datetime_flexible(&now_iso),
    ) {
        (Some(due_date), Some(now)) => {
            log::debug!(
                "Dates parsed successfully: due_date={:?}, now={:?}",
                due_date,
                now
            );

            let diff_ms = now.timestamp_millis() - due_date.timestamp_millis();
            log::debug!(
                "diff_ms = {} (now {} - due {})",
                diff_ms,
                now.timestamp_millis(),
                due_date.timestamp_millis()
            );

            let hours = (diff_ms as f64 / (1000.0 * 60.0 * 60.0)).floor();
            log::debug!("overdue_hours = {} (diff_ms / (1000*60*60))", hours);

            hours
        }
        _ => {
            log::warn!("Failed to parse dates, returning 0.0");
            0.0
        }
    };

    let json_result = serde_json::to_string(&result).unwrap_or_else(|_| "0.0".to_string());
    log::debug!("get_overdue_hours returning: {}", json_result);
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
