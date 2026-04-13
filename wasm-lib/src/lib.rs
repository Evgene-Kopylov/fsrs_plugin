use wasm_bindgen::prelude::*;
use rs_fsrs::Card;


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

// Оригинальная функция для обратной совместимости
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust with FSRS! Your input: {}", input)
}
