// Модуль для функций обработки повторения карточек FSRS

use rs_fsrs::FSRS;
use chrono::{DateTime, Utc};
use serde_json;
use serde_yaml;

use crate::types::{ModernFsrsCard, ReviewSession};
use crate::conversion::{rating_from_str, rating_to_string, create_fsrs_parameters};
use crate::fsrs_logic::create_card_from_last_session;
use crate::json_parsing::{parse_card_from_json, parse_parameters_from_json, parse_datetime_from_iso};

/// Обновляет карточку FSRS на основе оценки
pub fn review_card(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим входные данные
    let mut card = parse_card_from_json(&card_json);
    let parameters = parse_parameters_from_json(&parameters_json);
    let now = parse_datetime_from_iso(&now_str);
    let rating = rating_from_str(&rating_str);

    // Создаем Card для алгоритма FSRS из истории reviews
    let mut fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Обновляем elapsed_days на основе последней сессии
    if let Some(last_session) = card.reviews.last() {
        if let Ok(last_date) = last_session.date.parse::<DateTime<Utc>>() {
            let elapsed_days = (now - last_date).num_days().max(0) as i64;
            fsrs_card.elapsed_days = elapsed_days;
        }
    }

    // Применяем алгоритм FSRS
    let fsrs_params = create_fsrs_parameters(&parameters);
    let fsrs = FSRS::new(fsrs_params);
    let scheduling_info = fsrs.next(fsrs_card, now, rating);
    let updated_card = scheduling_info.card;

    // Добавляем новую сессию в карточку
    let new_session = ReviewSession {
        date: now.to_rfc3339(),
        rating: rating_to_string(rating),
        stability: updated_card.stability,
        difficulty: updated_card.difficulty,
    };

    card.reviews.push(new_session);
    card.srs = true;

    // Возвращаем обновленную карточку в формате JSON
    serde_json::to_string(&card)
        .unwrap_or_else(|_| r#"{"srs": true, "reviews": []}"#.to_string())
}

/// Получает YAML строку после повторения карточки
pub fn get_fsrs_yaml_after_review(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Обновляем карточку
    let updated_card_json = review_card(
        card_json,
        rating_str,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим обновленную карточку
    let card: ModernFsrsCard = serde_json::from_str(&updated_card_json)
        .unwrap_or_else(|_| {
            ModernFsrsCard {
                srs: true,
                reviews: Vec::new(),
            }
        });

    // Сериализуем в YAML
    serde_yaml::to_string(&card)
        .unwrap_or_else(|_| "srs: true\nreviews: []".to_string())
}
