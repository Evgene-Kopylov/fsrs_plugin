use crate::json_parsing::parse_datetime_flexible;
use crate::types::CardData;

/// Рассчитывает возраст карточки в днях (от первого повторения или создания)
pub fn get_card_age_days(card_json: String, now_iso: String) -> String {
    let result = match (
        serde_json::from_str::<CardData>(&card_json),
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
