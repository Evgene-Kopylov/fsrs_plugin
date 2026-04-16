use wasm_bindgen::prelude::*;

// Объявляем модули
mod types;
mod conversion;
mod fsrs_logic;
mod json_parsing;
mod review_functions;
mod state_functions;
mod yaml_parsing;
mod sort_functions;

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

// Парсит YAML строку в карточку FSRS (JSON строка)
#[wasm_bindgen]
pub fn parse_fsrs_yaml(yaml: String) -> String {
    use crate::yaml_parsing::parse_yaml_to_card;
    use crate::json_parsing::card_to_json;

    let card = parse_yaml_to_card(&yaml);
    card_to_json(&card)
}

// Преобразует JSON карточки в YAML строку
#[wasm_bindgen]
pub fn card_to_fsrs_yaml(card_json: String) -> String {
    use crate::json_parsing::parse_card_from_json;
    use crate::yaml_parsing::card_to_yaml;

    let card = parse_card_from_json(&card_json);
    card_to_yaml(&card)
}

// Извлекает FSRS карточку из frontmatter Obsidian
#[wasm_bindgen]
pub fn extract_fsrs_from_frontmatter_wrapped(frontmatter: String) -> String {
    use crate::yaml_parsing::extract_fsrs_from_frontmatter;
    use crate::json_parsing::card_to_json;

    use web_sys::console;

    console::debug_1(&format!("extract_fsrs_from_frontmatter_wrapped called with frontmatter length: {}", frontmatter.len()).into());

    let result = match extract_fsrs_from_frontmatter(&frontmatter) {
        Some(card) => {
            console::debug_1(&format!("extract_fsrs_from_frontmatter found card with {} reviews", card.reviews.len()).into());
            card_to_json(&card)
        },
        None => {
            console::debug_1(&"extract_fsrs_from_frontmatter returned None, returning null".into());
            "null".to_string()
        },
    };

    console::debug_1(&format!("extract_fsrs_from_frontmatter_wrapped returning JSON length: {}", result.len()).into());
    result
}

// Создает frontmatter с FSRS карточкой
#[wasm_bindgen]
pub fn create_frontmatter_with_fsrs_wrapped(card_json: String) -> String {
    use crate::json_parsing::parse_card_from_json;
    use crate::yaml_parsing::create_frontmatter_with_fsrs;

    let card = parse_card_from_json(&card_json);
    create_frontmatter_with_fsrs(&card)
}

// Валидирует сессии повторений в карточке
#[wasm_bindgen]
pub fn validate_fsrs_card(card_json: String) -> String {
    use crate::json_parsing::parse_card_from_json;
    use crate::yaml_parsing::validate_review_sessions;


    let card = parse_card_from_json(&card_json);
    let errors = validate_review_sessions(&card);

    serde_json::to_string(&errors).unwrap_or_else(|_| "[]".to_string())
}

// Парсит YAML с параметрами FSRS
#[wasm_bindgen]
pub fn parse_fsrs_parameters_yaml(yaml: String) -> String {
    use crate::yaml_parsing::parse_yaml_to_parameters;
    use crate::json_parsing::parameters_to_json;

    let params = parse_yaml_to_parameters(&yaml);
    parameters_to_json(&params)
}

// Фильтрация и сортировка карточек
#[wasm_bindgen]
pub fn filter_cards_for_review(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> String {
    sort_functions::filter_cards_for_review(cards_json, settings_json, now_iso)
}

#[wasm_bindgen]
pub fn sort_cards_by_priority(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> String {
    sort_functions::sort_cards_by_priority(cards_json, settings_json, now_iso)
}

#[wasm_bindgen]
pub fn group_cards_by_state(
    cards_json: String,
    settings_json: String,
    now_iso: String,
) -> String {
    sort_functions::group_cards_by_state(cards_json, settings_json, now_iso)
}

#[wasm_bindgen]
pub fn get_overdue_hours(due_iso: String, now_iso: String) -> String {
    sort_functions::get_overdue_hours(due_iso, now_iso)
}

#[wasm_bindgen]
pub fn get_hours_until_due(due_iso: String, now_iso: String) -> String {
    sort_functions::get_hours_until_due(due_iso, now_iso)
}

#[wasm_bindgen]
pub fn is_card_overdue(due_iso: String, now_iso: String) -> String {
    sort_functions::is_card_overdue(due_iso, now_iso)
}

#[wasm_bindgen]
pub fn get_card_age_days(card_json: String, now_iso: String) -> String {
    sort_functions::get_card_age_days(card_json, now_iso)
}

// Оригинальная функция для обратной совместимости
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust with FSRS! Your input: {}", input)
}
