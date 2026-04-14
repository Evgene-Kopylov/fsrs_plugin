use wasm_bindgen::prelude::*;

// Объявляем модули
mod types;
mod conversion;
mod fsrs_logic;
mod json_parsing;
mod review_functions;
mod state_functions;

// Функция для получения YAML строки для новой карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml() -> String {
    json_parsing::get_fsrs_yaml()
}

// Функция для обновления карточки FSRS на основе оценки
#[wasm_bindgen]
pub fn review_card(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    review_functions::review_card(
        card_json,
        rating_str,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для получения YAML строки после повторения карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml_after_review(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    review_functions::get_fsrs_yaml_after_review(
        card_json,
        rating_str,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для вычисления текущего состояния карточки
#[wasm_bindgen]
pub fn compute_current_state(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    state_functions::compute_current_state(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для получения всех возможных следующих дат повторения
#[wasm_bindgen]
pub fn get_next_review_dates(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    state_functions::get_next_review_dates(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для проверки, готова ли карточка к повторению
#[wasm_bindgen]
pub fn is_card_due(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    state_functions::is_card_due(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для получения извлекаемости (retrievability) карточки
#[wasm_bindgen]
pub fn get_retrievability(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    state_functions::get_retrievability(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для получения текущего времени в формате ISO 8601
#[wasm_bindgen]
pub fn get_current_time() -> String {
    json_parsing::get_current_time()
}

// Оригинальная функция для обратной совместимости
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust with FSRS! Your input: {}", input)
}
