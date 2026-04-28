use wasm_bindgen::prelude::*;

// Объявляем модули
mod cache;
mod card_history;
mod conversion;
mod current_state;
mod fsrs_logic;
mod json_parsing;
mod macros;
mod next_review;
mod review_functions;
mod sort_functions;
mod table_processing;
mod types;
mod yaml_parsing;

// Функция для получения YAML строки для новой карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml() -> String {
    json_parsing::get_fsrs_yaml()
}

// Функция для обновления карточки FSRS на основе оценки
/// Обновляет карточку FSRS на основе оценки
#[wasm_bindgen]
pub fn review_card(
    card_json: String,
    rating: u8,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    review_functions::review_card(
        card_json,
        rating,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для получения YAML строки после повторения карточки
/// Получает YAML строку после повторения карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml_after_review(
    card_json: String,
    rating: u8,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    review_functions::get_fsrs_yaml_after_review(
        card_json,
        rating,
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
    current_state::compute_current_state(
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
    next_review::get_next_review_dates(
        card_json,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    )
}

// Функция для вычисления истории карточки по всем повторениям
#[wasm_bindgen]
pub fn compute_card_history(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    card_history::compute_card_history(
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
    current_state::is_card_due(
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
    current_state::get_retrievability(
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
    use crate::json_parsing::card_to_json;
    use crate::yaml_parsing::parse_yaml_to_card;

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
    use crate::json_parsing::card_to_json;
    use crate::yaml_parsing::extract_fsrs_from_frontmatter;

    match extract_fsrs_from_frontmatter(&frontmatter) {
        Some(card) => card_to_json(&card),
        None => "null".to_string(),
    }
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
    use crate::json_parsing::parameters_to_json;
    use crate::yaml_parsing::parse_yaml_to_parameters;

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
pub fn group_cards_by_state(cards_json: String, settings_json: String, now_iso: String) -> String {
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

// Парсинг SQL-подобного синтаксиса для блоков fsrs-table
#[wasm_bindgen]
pub fn parse_fsrs_table_block(source: &str) -> String {
    use crate::table_processing::parsing::parse_fsrs_table_block as parse_block;
    match parse_block(source) {
        Ok(parse_result) => {
            // Возвращаем JSON с параметрами таблицы и предупреждениями
            serde_json::to_string(&serde_json::json!({
                "params": parse_result.value,
                "warnings": parse_result.warnings
            }))
            .unwrap_or_else(|_| "{\"error\":\"Failed to serialize params\"}".to_string())
        }
        Err(err) => {
            // Возвращаем JSON с ошибкой
            serde_json::to_string(&serde_json::json!({
                "error": err.to_string(),
                "params": null,
                "warnings": []
            }))
            .unwrap_or_else(|_| "{\"error\":\"Failed to serialize error\"}".to_string())
        }
    }
}

// Фильтрация и сортировка карточек для таблицы
#[wasm_bindgen]
pub fn filter_and_sort_cards(
    cards_json: &str,
    params_json: &str,
    settings_json: &str,
    now_iso: &str,
) -> String {
    crate::table_processing::filtering::filter_and_sort_cards_json(
        cards_json,
        params_json,
        settings_json,
        now_iso,
    )
}

// Фильтрация и сортировка карточек с SQL строкой напрямую
#[wasm_bindgen]
pub fn filter_and_sort_cards_with_sql(
    cards_json: &str,
    sql_source: &str,
    settings_json: &str,
    now_iso: &str,
) -> String {
    use crate::table_processing::parsing::parse_fsrs_table_block as parse_block;
    match parse_block(sql_source) {
        Ok(parse_result) => {
            // Преобразуем параметры в JSON для существующей функции
            let params_json = serde_json::to_string(&parse_result.value)
                .unwrap_or_else(|_| "{\"error\":\"Failed to serialize params\"}".to_string());
            // Вызываем существующую функцию фильтрации
            let filter_result = crate::table_processing::filtering::filter_and_sort_cards_json(
                cards_json,
                &params_json,
                settings_json,
                now_iso,
            );

            // Возвращаем объединённый результат с параметрами и отфильтрованными карточками
            serde_json::to_string(&serde_json::json!({
                "params": parse_result.value,
                "cards": serde_json::from_str::<serde_json::Value>(&filter_result)
                    .unwrap_or_else(|_| serde_json::json!({
                        "cards": [],
                        "total_count": 0,
                        "errors": []
                    })),
            }))
            .unwrap_or_else(|_| "{\"error\":\"Failed to serialize combined result\"}".to_string())
        }
        Err(err) => {
            // Возвращаем JSON с ошибкой
            serde_json::to_string(&serde_json::json!({
                "error": err.to_string(),
                "params": crate::table_processing::types::TableParams::default(),
                "cards": {
                    "cards": [],
                    "total_count": 0,
                    "errors": []
                }
            }))
            .unwrap_or_else(|_| "{\"error\":\"Failed to serialize error\"}".to_string())
        }
    }
}

// Фильтрация и сортировка карточек с готовыми состояниями
#[wasm_bindgen]
pub fn filter_and_sort_cards_with_states(
    cards_with_states_json: &str,
    params_json: &str,
    settings_json: &str,
    now_iso: &str,
) -> String {
    crate::table_processing::filtering::filter_and_sort_cards_with_states_json(
        cards_with_states_json,
        params_json,
        settings_json,
        now_iso,
    )
}

// Проверка валидности поля таблицы
#[wasm_bindgen]
pub fn is_valid_table_field(field: &str) -> bool {
    crate::table_processing::types::is_valid_table_field(field)
}

// ===================================================================
// Кэш карточек
// ===================================================================

#[wasm_bindgen]
pub fn init_cache() {
    cache::init_cache();
}

#[wasm_bindgen]
pub fn clear_cache() {
    cache::clear_cache();
}

#[wasm_bindgen]
pub fn add_or_update_cards(cards_json_array: &str) -> String {
    cache::add_or_update_cards(cards_json_array)
}

#[wasm_bindgen]
pub fn remove_card(file_path: &str) -> String {
    cache::remove_card(file_path)
}

#[wasm_bindgen]
pub fn get_all_cards() -> String {
    cache::get_all_cards()
}

#[wasm_bindgen]
pub fn get_cache_size() -> usize {
    cache::get_cache_size()
}

#[wasm_bindgen]
pub fn query_cards(params_json: &str, now_iso: &str) -> String {
    cache::query_cards(params_json, now_iso)
}

#[wasm_bindgen]
pub fn query_cards_count(params_json: &str, now_iso: &str) -> String {
    cache::query_cards_count(params_json, now_iso)
}

// Оригинальная функция для обратной совместимости
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust with FSRS! Your input: {}", input)
}
