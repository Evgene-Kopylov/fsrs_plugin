use wasm_bindgen::prelude::*;
use rs_fsrs::{Card, FSRS, Parameters, Rating, State};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Функция для получения YAML строки со всеми полями FSRS
#[wasm_bindgen]
pub fn get_fsrs_yaml() -> String {
    let card = Card::new();

    // Получаем строковые представления дат в формате ISO 8601
    let due_str = card.due.to_rfc3339();
    let last_review_str = card.last_review.to_rfc3339();

    // Форматируем YAML строку со всеми полями FSRS
    format!(
        "fsrs_due: \"{}\"\n\
         fsrs_stability: {}\n\
         fsrs_difficulty: {}\n\
         fsrs_elapsed_days: {}\n\
         fsrs_scheduled_days: {}\n\
         fsrs_reps: {}\n\
         fsrs_lapses: {}\n\
         fsrs_state: \"{:?}\"\n\
         fsrs_last_review: \"{}\"",
        due_str,
        card.stability,
        card.difficulty,
        card.elapsed_days,
        card.scheduled_days,
        card.reps,
        card.lapses,
        card.state,
        last_review_str
    )
}

// Функция для создания новой карточки и возврата JSON
#[wasm_bindgen]
pub fn create_fsrs_card_json() -> String {
    let card = Card::new();

    // Создаем JSON структуру
    let json = format!(
        r#"{{
    "due": "{}",
    "stability": {},
    "difficulty": {},
    "elapsed_days": {},
    "scheduled_days": {},
    "reps": {},
    "lapses": {},
    "state": "{:?}",
    "last_review": "{}"
}}"#,
        card.due.to_rfc3339(),
        card.stability,
        card.difficulty,
        card.elapsed_days,
        card.scheduled_days,
        card.reps,
        card.lapses,
        card.state,
        card.last_review.to_rfc3339()
    );

    json
}

// Функция для обновления карточки FSRS на основе оценки (рейтинга)
#[wasm_bindgen]
pub fn review_card(card_json: String, rating_str: String, now_str: String) -> String {
    // Парсим карточку из JSON
    let card: Card = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| panic!("Не удалось распарсить JSON карточки"));

    // Преобразуем строку рейтинга в enum Rating
    let rating_enum = match rating_str.as_str() {
        "Again" => Rating::Again,
        "Hard" => Rating::Hard,
        "Good" => Rating::Good,
        "Easy" => Rating::Easy,
        _ => Rating::Good, // По умолчанию Good
    };

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| panic!("Неверный формат времени. Используйте формат ISO 8601"));

    // Создаем экземпляр FSRS с параметрами по умолчанию
    let fsrs = FSRS::new(Parameters::default());

    // Получаем результат повторения карточки
    let scheduling_info = fsrs.next(card, now, rating_enum);

    // Возвращаем обновленную карточку в формате JSON
    serde_json::to_string(&scheduling_info.card)
        .unwrap_or_else(|_| panic!("Не удалось сериализовать карточку в JSON"))
}

// Функция для получения YAML строки после повторения карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml_after_review(
    card_json: String,
    rating_str: String,
    now_str: String
) -> String {
    // Обновляем карточку
    let updated_card_json = review_card(card_json, rating_str, now_str);
    let card: Card = serde_json::from_str(&updated_card_json)
        .unwrap_or_else(|_| panic!("Не удалось распарсить обновленную карточку"));

    // Форматируем YAML строку
    format!(
        "fsrs_due: \"{}\"\n\
         fsrs_stability: {}\n\
         fsrs_difficulty: {}\n\
         fsrs_elapsed_days: {}\n\
         fsrs_scheduled_days: {}\n\
         fsrs_reps: {}\n\
         fsrs_lapses: {}\n\
         fsrs_state: \"{:?}\"\n\
         fsrs_last_review: \"{}\"",
        card.due.to_rfc3339(),
        card.stability,
        card.difficulty,
        card.elapsed_days,
        card.scheduled_days,
        card.reps,
        card.lapses,
        card.state,
        card.last_review.to_rfc3339()
    )
}

// Функция для получения всех возможных следующих дат повторения для карточки
#[wasm_bindgen]
pub fn get_next_review_dates(
    card_json: String,
    now_str: String
) -> String {
    // Парсим карточку из JSON
    let card: Card = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| panic!("Не удалось распарсить JSON карточки"));

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| panic!("Неверный формат времени. Используйте формат ISO 8601"));

    // Создаем экземпляр FSRS с параметрами по умолчанию
    let fsrs = FSRS::new(Parameters::default());

    // Получаем все возможные результаты для разных оценок
    let record_log = fsrs.repeat(card, now);

    // Создаем структуру для результата
    #[derive(Serialize)]
    struct NextReviewDates {
        again: Option<String>,
        hard: Option<String>,
        good: Option<String>,
        easy: Option<String>,
    }

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
        .unwrap_or_else(|_| panic!("Не удалось сериализовать результат в JSON"))
}

// Функция для проверки, готова ли карточка к повторению
#[wasm_bindgen]
pub fn is_card_due(
    card_json: String,
    now_str: String
) -> String {
    // Парсим карточку из JSON
    let card: Card = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| panic!("Не удалось распарсить JSON карточки"));

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| panic!("Неверный формат времени. Используйте формат ISO 8601"));

    // Проверяем, прошла ли дата повторения
    let is_due = card.due <= now;

    // Возвращаем результат в формате JSON
    serde_json::to_string(&is_due)
        .unwrap_or_else(|_| panic!("Не удалось сериализовать результат в JSON"))
}

// Функция для получения извлекаемости (retrievability) карточки
#[wasm_bindgen]
pub fn get_retrievability(
    card_json: String,
    now_str: String
) -> String {
    // Парсим карточку из JSON
    let card: Card = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| panic!("Не удалось распарсить JSON карточки"));

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| panic!("Неверный формат времени. Используйте формат ISO 8601"));

    // Получаем извлекаемость
    let retrievability = card.get_retrievability(now);

    // Возвращаем результат в формате JSON
    serde_json::to_string(&retrievability)
        .unwrap_or_else(|_| panic!("Не удалось сериализовать результат в JSON"))
}

// Функция для конвертации состояния карточки в строку
#[wasm_bindgen]
pub fn card_state_to_string(state_str: String) -> String {
    // Парсим состояние из строки
    let state = match state_str.as_str() {
        "New" => State::New,
        "Learning" => State::Learning,
        "Review" => State::Review,
        "Relearning" => State::Relearning,
        _ => State::New,
    };

    format!("{:?}", state)
}

// Функция для получения текущего времени в формате ISO 8601
#[wasm_bindgen]
pub fn get_current_time() -> String {
    Utc::now().to_rfc3339()
}

// Оригинальная функция для обратной совместимости
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust with FSRS! Your input: {}", input)
}
