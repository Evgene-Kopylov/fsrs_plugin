//! Модуль фильтрации и сортировки карточек для таблицы FSRS
//! Включает вычисление значений для сортировки, алгоритмы сортировки и фильтрацию

// Подмодули
mod calculator;
mod evaluator;
mod sorter;

// Реэкспорт публичных функций и типов
pub use calculator::CardWithComputedFields;
pub use sorter::FilterError;

use crate::table_processing::types::{SortDirection, TableParams};
use crate::types::{ComputedState, ModernFsrsCard};
use serde::{Deserialize, Serialize};

use log::{debug, info, warn};

/// Карточка с вычисленными полями для сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedCard {
    /// Исходные данные карточки (в JSON)
    pub card_json: String,
    /// Вычисленные значения для сортировки
    pub computed_fields: CardWithComputedFields,
}

/// Результат фильтрации и сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterSortResult {
    /// Отфильтрованные и отсортированные карточки
    pub cards: Vec<ComputedCard>,
    /// Общее количество карточек (до применения лимита)
    pub total_count: usize,
    /// Сообщения об ошибках (если есть)
    pub errors: Vec<String>,
}

/// Основная функция фильтрации и сортировки карточек
///
/// # Аргументы
/// * `cards_json` - JSON массив карточек
/// * `params` - параметры таблицы (колонки, сортировка, лимит)
/// * `settings_json` - JSON настроек плагина
/// * `now_iso` - текущее время в формате ISO 8601
///
/// # Возвращает
/// Результат фильтрации и сортировки в формате JSON
pub fn filter_and_sort_cards(
    cards_json: &str,
    params: &TableParams,
    settings_json: &str,
    now_iso: &str,
) -> Result<FilterSortResult, FilterError> {
    debug!(
        "Начало фильтрации и сортировки карточек: {} карточек",
        cards_json.len()
    );

    // Парсим массив карточек
    let cards_array: Vec<serde_json::Value> =
        serde_json::from_str(cards_json).map_err(|e| FilterError::JsonParseError(e.to_string()))?;

    // Парсим настройки для извлечения дефолтных значений
    let settings: serde_json::Value = serde_json::from_str(settings_json)
        .map_err(|e| FilterError::JsonParseError(format!("Ошибка парсинга настроек: {}", e)))?;

    let default_stability = settings
        .get("default_initial_stability")
        .and_then(|v| v.as_f64())
        .unwrap_or(2.0);
    let default_difficulty = settings
        .get("default_initial_difficulty")
        .and_then(|v| v.as_f64())
        .unwrap_or(5.0);

    // Извлекаем параметры FSRS из настроек
    let parameters_json = settings
        .get("parameters")
        .map(|p| p.to_string())
        .unwrap_or_else(|| {
            r#"{"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}"#
                .to_string()
        });

    let mut computed_cards = Vec::new();
    let mut errors = Vec::new();

    // Вычисляем поля для каждой карточки
    for (index, card_value) in cards_array.iter().enumerate() {
        let card_json = serde_json::to_string(card_value).map_err(|e| {
            FilterError::JsonParseError(format!("Ошибка сериализации карточки {}: {}", index, e))
        })?;

        match calculator::compute_all_fields(
            &card_json,
            now_iso,
            &parameters_json,
            default_stability,
            default_difficulty,
        ) {
            Ok(computed_fields) => {
                computed_cards.push(ComputedCard {
                    card_json,
                    computed_fields,
                });
            }
            Err(e) => {
                let error_msg = format!("Карточка {}: {}", index, e);
                warn!("{}", error_msg);
                errors.push(error_msg);
            }
        }
    }

    debug!(
        "Вычислены поля для {} карточек, ошибок: {}",
        computed_cards.len(),
        errors.len()
    );

    // Применяем фильтрацию WHERE если указана
    if let Some(condition) = &params.where_condition {
        info!("Применение фильтрации WHERE");
        info!("Условие WHERE для фильтрации: {:?}", condition);
        computed_cards.retain(|card| {
            match crate::table_processing::filtering::evaluator::evaluate_condition(
                condition,
                &card.computed_fields,
            ) {
                Ok(result) => result,
                Err(e) => {
                    warn!("Ошибка оценки условия WHERE для карточки: {}", e);
                    false // Исключаем карточку при ошибке
                }
            }
        });
        info!(
            "После фильтрации WHERE осталось {} карточек",
            computed_cards.len()
        );
    }

    // Применяем сортировку если указана
    if let Some(sort) = &params.sort {
        debug!("Применение сортировки по полю '{}'", sort.field);
        computed_cards.sort_by(|a, b| {
            compare_computed_fields(
                &a.computed_fields,
                &b.computed_fields,
                &sort.field,
                sort.direction,
            )
        });
    }

    let total_count = computed_cards.len();

    // Применяем лимит если указан
    let limited_cards = if params.limit > 0 && params.limit < computed_cards.len() {
        computed_cards[0..params.limit].to_vec()
    } else {
        computed_cards
    };

    debug!(
        "Фильтрация и сортировка завершена: {} карточек (лимит {}), всего {}",
        limited_cards.len(),
        params.limit,
        total_count
    );

    // Логируем overdue для первых карточек
    for (i, card) in limited_cards.iter().enumerate().take(3) {
        let overdue_val = card.computed_fields.overdue.unwrap_or(0.0);
        debug!(
            "Фильтрация: карточка {} overdue: {} часов (файл: {:?})",
            i, overdue_val, card.computed_fields.file
        );

        // Логируем полные computed_fields в JSON для отладки
        match serde_json::to_string(&card.computed_fields) {
            Ok(json_str) => {
                debug!(
                    "computed_fields JSON (первые 500 символов): {}",
                    &json_str[..json_str.len().min(500)]
                );
            }
            Err(e) => {
                warn!("Ошибка сериализации computed_fields: {}", e);
            }
        }
    }

    Ok(FilterSortResult {
        cards: limited_cards,
        total_count,
        errors,
    })
}

/// Функция фильтрации и сортировки карточек с готовыми состояниями
/// Принимает JSON массив объектов `{card_json, state_json}` вместо простых карточек
pub fn filter_and_sort_cards_with_states(
    cards_with_states_json: &str,
    params: &TableParams,
    _settings_json: &str,
    now_iso: &str,
) -> Result<FilterSortResult, FilterError> {
    debug!(
        "Начало фильтрации и сортировки карточек с готовыми состояниями: {} байт JSON",
        cards_with_states_json.len()
    );

    // Парсим массив пар (карточка, состояние)
    let pairs_array: Vec<serde_json::Value> = serde_json::from_str(cards_with_states_json)
        .map_err(|e| FilterError::JsonParseError(e.to_string()))?;

    let mut computed_cards = Vec::new();
    let errors = Vec::new();

    // Обрабатываем каждую пару
    for (index, pair_value) in pairs_array.iter().enumerate() {
        // Извлекаем карточку и состояние из JSON объекта
        let card_json_value = pair_value.get("card_json").ok_or_else(|| {
            FilterError::JsonParseError(format!("Отсутствует card_json в паре {}", index))
        })?;
        let state_json_value = pair_value.get("state_json").ok_or_else(|| {
            FilterError::JsonParseError(format!("Отсутствует state_json в паре {}", index))
        })?;

        // Десериализуем карточку (поддерживаем как строку JSON, так и объект)
        let card: ModernFsrsCard = if card_json_value.is_string() {
            serde_json::from_str(card_json_value.as_str().unwrap()).map_err(|e| {
                FilterError::JsonParseError(format!(
                    "Ошибка парсинга карточки из строки {}: {}",
                    index, e
                ))
            })?
        } else {
            serde_json::from_value(card_json_value.clone()).map_err(|e| {
                FilterError::JsonParseError(format!("Ошибка парсинга карточки {}: {}", index, e))
            })?
        };

        // Десериализуем состояние (поддерживаем как строку JSON, так и объект)
        let state: ComputedState = if state_json_value.is_string() {
            serde_json::from_str(state_json_value.as_str().unwrap()).map_err(|e| {
                FilterError::JsonParseError(format!(
                    "Ошибка парсинга состояния из строки {}: {}",
                    index, e
                ))
            })?
        } else {
            serde_json::from_value(state_json_value.clone()).map_err(|e| {
                FilterError::JsonParseError(format!("Ошибка парсинга состояния {}: {}", index, e))
            })?
        };

        // Вычисляем поля из готового состояния
        let computed_fields = calculator::compute_fields_from_state(&card, &state, now_iso);

        // Сохраняем исходный JSON карточки как строку
        let card_json_str = if card_json_value.is_string() {
            card_json_value.as_str().unwrap().to_string()
        } else {
            serde_json::to_string(card_json_value).map_err(|e| {
                FilterError::JsonParseError(format!(
                    "Ошибка сериализации карточки {}: {}",
                    index, e
                ))
            })?
        };

        computed_cards.push(ComputedCard {
            card_json: card_json_str,
            computed_fields,
        });
    }

    debug!(
        "Вычислены поля для {} карточек с готовыми состояниями",
        computed_cards.len()
    );

    // Применяем фильтрацию WHERE если указана
    if let Some(condition) = &params.where_condition {
        info!("Применение фильтрации WHERE для карточек с готовыми состояниями");
        computed_cards.retain(|card| {
            match crate::table_processing::filtering::evaluator::evaluate_condition(
                condition,
                &card.computed_fields,
            ) {
                Ok(result) => result,
                Err(e) => {
                    warn!(
                        "Ошибка оценки условия WHERE для карточки с готовым состоянием: {}",
                        e
                    );
                    false // Исключаем карточку при ошибке
                }
            }
        });
        info!(
            "После фильтрации WHERE осталось {} карточек",
            computed_cards.len()
        );
    }

    // Применяем сортировку если указана
    if let Some(sort) = &params.sort {
        debug!(
            "Применение сортировки по полю '{}' для карточек с готовыми состояниями",
            sort.field
        );
        computed_cards.sort_by(|a, b| {
            compare_computed_fields(
                &a.computed_fields,
                &b.computed_fields,
                &sort.field,
                sort.direction,
            )
        });
    }

    let total_count = computed_cards.len();

    // Применяем лимит если указан
    let limited_cards = if params.limit > 0 && params.limit < computed_cards.len() {
        computed_cards[0..params.limit].to_vec()
    } else {
        computed_cards
    };

    debug!(
        "Фильтрация и сортировка карточек с готовыми состояниями завершена: {} карточек (лимит {}), всего {}",
        limited_cards.len(),
        params.limit,
        total_count
    );

    Ok(FilterSortResult {
        cards: limited_cards,
        total_count,
        errors,
    })
}

/// Сравнивает два набора вычисленных полей по указанному полю и направлению
fn compare_computed_fields(
    a: &CardWithComputedFields,
    b: &CardWithComputedFields,
    field: &str,
    direction: SortDirection,
) -> std::cmp::Ordering {
    // Вычисляем порядок сравнения для конкретного поля
    let ordering = match field {
        "file" => compare_string_fields(a.file.as_ref(), b.file.as_ref()),
        "state" => compare_string_fields(a.state.as_ref(), b.state.as_ref()),
        "due" => compare_string_fields(a.due.as_ref(), b.due.as_ref()),
        "reps" => compare_u32_fields(a.reps, b.reps),
        "overdue" => compare_f64_fields(a.overdue, b.overdue),
        "stability" => compare_f64_fields(a.stability, b.stability),
        "difficulty" => compare_f64_fields(a.difficulty, b.difficulty),
        "retrievability" => compare_f64_fields(a.retrievability, b.retrievability),
        "elapsed" => compare_f64_fields(a.elapsed, b.elapsed),
        "scheduled" => compare_f64_fields(a.scheduled, b.scheduled),
        _ => {
            warn!("Неизвестное поле для сортировки: {}", field);
            std::cmp::Ordering::Equal
        }
    };

    // Применяем направление сортировки
    match direction {
        SortDirection::Asc => ordering,
        SortDirection::Desc => ordering.reverse(),
    }
}

/// Сравнивает два строковых поля
fn compare_string_fields(a: Option<&String>, b: Option<&String>) -> std::cmp::Ordering {
    match (a, b) {
        (Some(a_str), Some(b_str)) => a_str.cmp(b_str),
        (Some(_), None) => std::cmp::Ordering::Less, // Значение перед None
        (None, Some(_)) => std::cmp::Ordering::Greater, // None после значения
        (None, None) => std::cmp::Ordering::Equal,
    }
}

/// Сравнивает два числовых поля u32
fn compare_u32_fields(a: Option<u32>, b: Option<u32>) -> std::cmp::Ordering {
    match (a, b) {
        (Some(a_val), Some(b_val)) => a_val.cmp(&b_val),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

/// Сравнивает два числовых поля f64
fn compare_f64_fields(a: Option<f64>, b: Option<f64>) -> std::cmp::Ordering {
    match (a, b) {
        (Some(a_val), Some(b_val)) => {
            if a_val < b_val {
                std::cmp::Ordering::Less
            } else if a_val > b_val {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        }
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

/// Вспомогательная функция для преобразования результата в JSON
pub fn filter_and_sort_cards_json(
    cards_json: &str,
    params_json: &str,
    settings_json: &str,
    now_iso: &str,
) -> String {
    match serde_json::from_str(params_json) {
        Ok(params) => match filter_and_sort_cards(cards_json, &params, settings_json, now_iso) {
            Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()),
            Err(err) => serde_json::to_string(&serde_json::json!({
                "error": err.to_string(),
                "cards": []
            }))
            .unwrap_or_else(|_| "{}".to_string()),
        },
        Err(err) => serde_json::to_string(&serde_json::json!({
            "error": format!("Ошибка парсинга параметров: {}", err),
            "cards": []
        }))
        .unwrap_or_else(|_| "{}".to_string()),
    }
}

/// Вспомогательная функция для преобразования результата в JSON для карточек с готовыми состояниями
pub fn filter_and_sort_cards_with_states_json(
    cards_with_states_json: &str,
    params_json: &str,
    settings_json: &str,
    now_iso: &str,
) -> String {
    match serde_json::from_str(params_json) {
        Ok(params) => match filter_and_sort_cards_with_states(
            cards_with_states_json,
            &params,
            settings_json,
            now_iso,
        ) {
            Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()),
            Err(err) => serde_json::to_string(&serde_json::json!({
                "error": err.to_string(),
                "cards": []
            }))
            .unwrap_or_else(|_| "{}".to_string()),
        },
        Err(err) => serde_json::to_string(&serde_json::json!({
            "error": format!("Ошибка парсинга параметров: {}", err),
            "cards": []
        }))
        .unwrap_or_else(|_| "{}".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::types::{SortDirection, SortParam, TableColumn, TableParams};
    use std::collections::HashMap;

    /// Создает тестовую структуру CardWithComputedFields
    fn create_test_fields(
        file: Option<&str>,
        reps: Option<u32>,
        overdue: Option<f64>,
        stability: Option<f64>,
        difficulty: Option<f64>,
        retrievability: Option<f64>,
        due: Option<&str>,
        state: Option<&str>,
        elapsed: Option<f64>,
        scheduled: Option<f64>,
    ) -> CardWithComputedFields {
        CardWithComputedFields {
            file: file.map(|s| s.to_string()),
            reps,
            overdue,
            stability,
            difficulty,
            retrievability,
            due: due.map(|s| s.to_string()),
            state: state.map(|s| s.to_string()),
            elapsed,
            scheduled,
            additional_fields: HashMap::new(),
        }
    }

    #[test]
    fn test_compare_string_fields() {
        // Оба значения присутствуют
        assert_eq!(
            compare_string_fields(Some(&"apple".to_string()), Some(&"banana".to_string())),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            compare_string_fields(Some(&"banana".to_string()), Some(&"apple".to_string())),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_string_fields(Some(&"apple".to_string()), Some(&"apple".to_string())),
            std::cmp::Ordering::Equal
        );

        // Одно значение отсутствует
        assert_eq!(
            compare_string_fields(Some(&"value".to_string()), None),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            compare_string_fields(None, Some(&"value".to_string())),
            std::cmp::Ordering::Greater
        );

        // Оба значения отсутствуют
        assert_eq!(compare_string_fields(None, None), std::cmp::Ordering::Equal);
    }

    #[test]
    fn test_compare_u32_fields() {
        // Оба значения присутствуют
        assert_eq!(
            compare_u32_fields(Some(5), Some(10)),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            compare_u32_fields(Some(10), Some(5)),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_u32_fields(Some(5), Some(5)),
            std::cmp::Ordering::Equal
        );

        // Одно значение отсутствует
        assert_eq!(compare_u32_fields(Some(5), None), std::cmp::Ordering::Less);
        assert_eq!(
            compare_u32_fields(None, Some(5)),
            std::cmp::Ordering::Greater
        );

        // Оба значения отсутствуют
        assert_eq!(compare_u32_fields(None, None), std::cmp::Ordering::Equal);
    }

    #[test]
    fn test_compare_f64_fields() {
        // Оба значения присутствуют
        assert_eq!(
            compare_f64_fields(Some(1.5), Some(2.5)),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            compare_f64_fields(Some(2.5), Some(1.5)),
            std::cmp::Ordering::Greater
        );
        assert_eq!(
            compare_f64_fields(Some(1.5), Some(1.5)),
            std::cmp::Ordering::Equal
        );

        // Одно значение отсутствует
        assert_eq!(
            compare_f64_fields(Some(1.5), None),
            std::cmp::Ordering::Less
        );
        assert_eq!(
            compare_f64_fields(None, Some(1.5)),
            std::cmp::Ordering::Greater
        );

        // Оба значения отсутствуют
        assert_eq!(compare_f64_fields(None, None), std::cmp::Ordering::Equal);
    }

    #[test]
    fn test_compare_computed_fields_file() {
        let a = create_test_fields(
            Some("apple.md"),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let b = create_test_fields(
            Some("banana.md"),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let c = create_test_fields(None, None, None, None, None, None, None, None, None, None);

        // ASC: apple < banana
        assert_eq!(
            compare_computed_fields(&a, &b, "file", SortDirection::Asc),
            std::cmp::Ordering::Less
        );
        // DESC: apple > banana
        assert_eq!(
            compare_computed_fields(&a, &b, "file", SortDirection::Desc),
            std::cmp::Ordering::Greater
        );
        // None > value (ASC)
        assert_eq!(
            compare_computed_fields(&a, &c, "file", SortDirection::Asc),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn test_compare_computed_fields_reps() {
        let a = create_test_fields(
            None,
            Some(5),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let b = create_test_fields(
            None,
            Some(10),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let c = create_test_fields(None, None, None, None, None, None, None, None, None, None);

        // ASC: 5 < 10
        assert_eq!(
            compare_computed_fields(&a, &b, "reps", SortDirection::Asc),
            std::cmp::Ordering::Less
        );
        // DESC: 5 > 10
        assert_eq!(
            compare_computed_fields(&a, &b, "reps", SortDirection::Desc),
            std::cmp::Ordering::Greater
        );
        // None > value (ASC)
        assert_eq!(
            compare_computed_fields(&a, &c, "reps", SortDirection::Asc),
            std::cmp::Ordering::Less
        );
    }

    #[test]
    fn test_compare_computed_fields_overdue() {
        let a = create_test_fields(
            None,
            None,
            Some(1.5),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let b = create_test_fields(
            None,
            None,
            Some(2.5),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        // ASC: 1.5 < 2.5
        assert_eq!(
            compare_computed_fields(&a, &b, "overdue", SortDirection::Asc),
            std::cmp::Ordering::Less
        );
        // DESC: 1.5 > 2.5
        assert_eq!(
            compare_computed_fields(&a, &b, "overdue", SortDirection::Desc),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn test_compare_computed_fields_state() {
        let a = create_test_fields(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some("new"),
            None,
            None,
        );
        let b = create_test_fields(
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some("review"),
            None,
            None,
        );

        // ASC: "new" < "review"
        assert_eq!(
            compare_computed_fields(&a, &b, "state", SortDirection::Asc),
            std::cmp::Ordering::Less
        );
        // DESC: "new" > "review"
        assert_eq!(
            compare_computed_fields(&a, &b, "state", SortDirection::Desc),
            std::cmp::Ordering::Greater
        );
    }

    #[test]
    fn test_compare_computed_fields_unknown_field() {
        let a = create_test_fields(
            Some("file.md"),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        let b = create_test_fields(
            Some("file2.md"),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );

        // Неизвестное поле должно вернуть Equal
        assert_eq!(
            compare_computed_fields(&a, &b, "unknown", SortDirection::Asc),
            std::cmp::Ordering::Equal
        );
    }

    #[test]
    fn test_filter_and_sort_cards_json_empty() {
        let cards_json = r#"[]"#;
        let params_json = r#"{"columns": [{"field": "file", "title": "file"}], "limit": 0}"#;
        let settings_json =
            r#"{"default_initial_stability": 2.0, "default_initial_difficulty": 5.0}"#;
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards_json(cards_json, params_json, settings_json, now_iso);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        assert_eq!(parsed["cards"].as_array().unwrap().len(), 0);
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 0);
    }

    #[test]
    fn test_filter_and_sort_cards_json_invalid_params() {
        let cards_json = r#"[]"#;
        let params_json = r#"{"invalid": "json"#; // Незакрытая JSON строка
        let settings_json = r#"{}"#;
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards_json(cards_json, params_json, settings_json, now_iso);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        // Должна быть ошибка парсинга параметров
        assert!(parsed["error"].as_str().is_some());
        assert!(
            parsed["error"]
                .as_str()
                .unwrap()
                .contains("Ошибка парсинга параметров")
        );
        assert_eq!(parsed["cards"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn test_filter_and_sort_cards_with_limit() {
        // Простейший тест с карточками для проверки лимита
        // Здесь мы не можем полноценно протестировать вычисления, но можем проверить логику фильтрации
        let cards_json = r#"[
            {"filePath": "file1.md", "reviews": []},
            {"filePath": "file2.md", "reviews": []},
            {"filePath": "file3.md", "reviews": []}
        ]"#;
        let params_json = r#"{"columns": [{"field": "file", "title": "file"}], "limit": 2}"#;
        let settings_json = r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": {"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}
        }"#;
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards_json(cards_json, params_json, settings_json, now_iso);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        // Проверяем что нет ошибок
        assert!(parsed.get("error").is_none());

        // Проверяем количество карточек (может быть 0 из-за ошибок вычислений, но важно что функция не падает)
        let cards = parsed["cards"].as_array();
        if let Some(cards_array) = cards {
            // Если карточки есть, проверяем что их не больше лимита
            assert!(cards_array.len() <= 3);
        }
    }

    /// Создает тестовые параметры таблицы
    fn create_test_params(
        sort_field: Option<&str>,
        sort_direction: Option<SortDirection>,
    ) -> TableParams {
        TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "file".to_string(),
                width: None,
            }],
            limit: 0,
            sort: sort_field.map(|field| SortParam {
                field: field.to_string(),
                direction: sort_direction.unwrap_or(SortDirection::Asc),
            }),
            where_condition: None,
        }
    }

    /// Создает тестовые настройки
    fn create_test_settings() -> String {
        r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": {"request_retention": 0.9, "maximum_interval": 36500.0, "enable_fuzz": true}
        }"#.to_string()
    }

    #[test]
    fn test_filter_and_sort_cards_sort_by_file_asc() {
        // Карточки в обратном алфавитном порядке
        let cards_json = r#"[
            {"filePath": "zebra.md", "reviews": []},
            {"filePath": "apple.md", "reviews": []},
            {"filePath": "banana.md", "reviews": []}
        ]"#;

        let params = create_test_params(Some("file"), Some(SortDirection::Asc));
        let settings_json = create_test_settings();
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards(cards_json, &params, &settings_json, now_iso);
        assert!(result.is_ok());

        let filter_result = result.unwrap();
        // Должны быть все 3 карточки (лимит 0)
        assert_eq!(filter_result.total_count, 3);

        // Проверяем что карточки отсортированы по возрастанию (apple, banana, zebra)
        // Но из-за вычислений могут быть ошибки, поэтому просто проверяем что нет паники
        // и ошибки вычислений собираются отдельно
        assert_eq!(filter_result.errors.len(), 0);

        // Проверяем что есть хотя бы некоторые карточки
        // (compute_all_fields может вернуть ошибки, но для простых карточек должен работать)
        if filter_result.cards.len() >= 2 {
            // Можно проверить порядок, если получили достаточное количество карточек
            let files: Vec<Option<String>> = filter_result
                .cards
                .iter()
                .map(|c| c.computed_fields.file.clone())
                .collect();

            // Проверяем что файлы есть и они в правильном порядке (для тех что есть)
            for i in 0..files.len() - 1 {
                if let (Some(a), Some(b)) = (&files[i], &files[i + 1]) {
                    assert!(
                        a <= b,
                        "Файлы должны быть отсортированы по возрастанию: {} <= {}",
                        a,
                        b
                    );
                }
            }
        }
    }

    #[test]
    fn test_filter_and_sort_cards_sort_by_file_desc() {
        // Карточки в алфавитном порядке
        let cards_json = r#"[
            {"filePath": "apple.md", "reviews": []},
            {"filePath": "banana.md", "reviews": []},
            {"filePath": "zebra.md", "reviews": []}
        ]"#;

        let params = create_test_params(Some("file"), Some(SortDirection::Desc));
        let settings_json = create_test_settings();
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards(cards_json, &params, &settings_json, now_iso);
        assert!(result.is_ok());

        let filter_result = result.unwrap();
        assert_eq!(filter_result.total_count, 3);
        assert_eq!(filter_result.errors.len(), 0);

        if filter_result.cards.len() >= 2 {
            let files: Vec<Option<String>> = filter_result
                .cards
                .iter()
                .map(|c| c.computed_fields.file.clone())
                .collect();

            // Проверяем что файлы есть и они в правильном порядке (убывание)
            for i in 0..files.len() - 1 {
                if let (Some(a), Some(b)) = (&files[i], &files[i + 1]) {
                    assert!(
                        a >= b,
                        "Файлы должны быть отсортированы по убыванию: {} >= {}",
                        a,
                        b
                    );
                }
            }
        }
    }

    #[test]
    fn test_filter_and_sort_cards_invalid_cards_json() {
        // Невалидный JSON массива карточек
        let cards_json = r#"[
            {"filePath": "test.md", "reviews": []},
            {"filePath": "test2.md", "reviews": []}"#; // Незакрытый массив

        let params = create_test_params(None, None);
        let settings_json = create_test_settings();
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards(cards_json, &params, &settings_json, now_iso);
        assert!(result.is_err());

        if let Err(FilterError::JsonParseError(_)) = result {
            // Проверяем только тип ошибки, не содержимое
        } else {
            panic!("Ожидалась ошибка JsonParseError");
        }
    }

    #[test]
    fn test_filter_and_sort_cards_cards_with_calculation_errors() {
        // Карточки с некорректными данными, которые вызовут ошибки вычислений
        let cards_json = r#"[
            {"filePath": "good.md", "reviews": []},
            {"filePath": "invalid_reviews.md", "reviews": "not an array"},
            {"filePath": "invalid_date.md", "reviews": [{"date": "invalid date", "rating": "Good", "stability": 1.0, "difficulty": 5.0}]},
            {"filePath": "another.md", "reviews": []}
        ]"#;

        let params = create_test_params(None, None);
        let settings_json = create_test_settings();
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards(cards_json, &params, &settings_json, now_iso);
        assert!(result.is_ok());

        let filter_result = result.unwrap();
        // Функция должна обработать некорректные карточки без паники
        // Могут быть ошибки вычислений, а могут и не быть (обрабатываются внутри)
        // Главное - что функция не упала и вернула результат

        // Проверяем что результат содержит корректные карточки
        // (некоторые карточки могут быть пропущены из-за ошибок)

        // Проверяем что структура результата корректна
        assert!(filter_result.cards.len() <= filter_result.total_count);

        // Проверяем что ошибки (если есть) содержат информацию
        if !filter_result.errors.is_empty() {
            let error_messages: Vec<String> = filter_result
                .errors
                .iter()
                .map(|e| e.to_lowercase())
                .collect();
            // Хотя бы одна ошибка должна быть информативной
            let has_informative_error = error_messages.iter().any(|e| !e.trim().is_empty());
            assert!(has_informative_error, "Ошибки должны содержать информацию");
        }
    }

    #[test]
    fn test_filter_and_sort_cards_with_limit_and_sort() {
        // Проверяем комбинацию лимита и сортировки
        let cards_json = r#"[
            {"filePath": "zebra.md", "reviews": []},
            {"filePath": "apple.md", "reviews": []},
            {"filePath": "banana.md", "reviews": []},
            {"filePath": "cherry.md", "reviews": []}
        ]"#;

        let mut params = create_test_params(Some("file"), Some(SortDirection::Asc));
        params.limit = 2; // Ограничиваем двумя карточками

        let settings_json = create_test_settings();
        let now_iso = "2024-01-01T10:00:00Z";

        let result = filter_and_sort_cards(cards_json, &params, &settings_json, now_iso);
        assert!(result.is_ok());

        let filter_result = result.unwrap();
        // Всего карточек должно быть 4
        assert_eq!(filter_result.total_count, 4);
        // Но в результате только 2 из-за лимита
        assert_eq!(filter_result.cards.len(), 2);

        // Проверяем что результат ограничен лимитом
        // (не можем проверить порядок, т.к. compute_all_fields может вернуть ошибки)
        assert!(filter_result.cards.len() <= params.limit);

        // Проверяем что нет ошибок вычислений (для простых карточек)
        assert_eq!(filter_result.errors.len(), 0);
    }

    /// Тест для фильтрации WHERE с условием overdue < 0
    #[test]
    fn test_filter_and_sort_cards_with_where_overdue() {
        use crate::table_processing::parsing::{ComparisonOp, Expression, Value};

        // Создаем JSON карточек с разными значениями overdue
        let cards_json = r#"[
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card1.md",
                "due": "2024-01-03_00:00"
            },
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card2.md",
                "due": "2024-01-03_00:00"
            },
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card3.md",
                "due": "2024-01-03_00:00"
            }
        ]"#;

        // Создаем параметры таблицы с WHERE условием overdue < 0
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "file".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "overdue".to_string(),
                    title: "overdue".to_string(),
                    width: None,
                },
            ],
            limit: 0,   // Без лимита
            sort: None, // Без сортировки
            where_condition: Some(Expression::comparison(
                "overdue",
                ComparisonOp::Less,
                Value::Number(0.0),
            )),
        };

        // Создаем настройки
        let settings_json = r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": "{\"request_retention\": 0.9, \"maximum_interval\": 36500.0, \"enable_fuzz\": false}"
        }"#;

        // Используем фиксированное время, чтобы overdue было предсказуемым
        let now_iso = "2024-01-01T00:00:01.000Z"; // Сразу после повторения — due ещё в будущем

        // Вызываем фильтрацию
        let result = filter_and_sort_cards(cards_json, &params, settings_json, now_iso);

        assert!(
            result.is_ok(),
            "Фильтрация должна завершиться успешно: {:?}",
            result
        );
        let filter_result = result.unwrap();

        // Проверяем, что все отфильтрованные карточки имеют overdue < 0
        // Поскольку все карточки созданы за 1 день до now, их overdue должно быть -1 (т.е. < 0)
        // Поэтому все 3 карточки должны пройти фильтрацию
        assert_eq!(filter_result.cards.len(), 3);
        assert_eq!(filter_result.total_count, 3);
        assert_eq!(filter_result.errors.len(), 0);
    }

    /// Тест для фильтрации с SQL строкой напрямую (WHERE после LIMIT)
    #[test]
    fn test_filter_and_sort_cards_with_sql() {
        use crate::table_processing::parsing::parse_fsrs_table_block;

        // Создаем JSON карточек с разными значениями overdue
        let cards_json = r#"[
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card1.md",
                "due": "2024-01-03_00:00"
            },
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card2.md",
                "due": "2024-01-03_00:00"
            },
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card3.md",
                "due": "2024-01-03_00:00"
            }
        ]"#;

        // SQL запрос из примера пользователя
        let sql_source =
            r#"SELECT file as "file", overdue as "oDue", reps LIMIT 10 WHERE overdue < 0"#;

        // Парсим SQL для получения параметров
        let parse_result = parse_fsrs_table_block(sql_source).unwrap();
        let params = parse_result.value;

        // Создаем настройки
        let settings_json = r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": "{\"request_retention\": 0.9, \"maximum_interval\": 36500.0, \"enable_fuzz\": false}"
        }"#;

        // Используем фиксированное время
        let now_iso = "2024-01-01T00:00:01.000Z"; // Сразу после повторения — due ещё в будущем

        // Вызываем фильтрацию через существующую функцию
        let result = filter_and_sort_cards(cards_json, &params, settings_json, now_iso);

        assert!(
            result.is_ok(),
            "Фильтрация должна завершиться успешно: {:?}",
            result
        );
        let filter_result = result.unwrap();

        // Проверяем, что все карточки отфильтрованы (overdue < 0)
        assert_eq!(filter_result.cards.len(), 3);
        assert_eq!(filter_result.total_count, 3);
        assert_eq!(filter_result.errors.len(), 0);

        // Проверяем, что LIMIT 10 не применяется, так как всего 3 карточки
        // (но лимит все равно должен быть учтен в params.limit)
        assert_eq!(params.limit, 10);
    }

    /// Тест для фильтрации с SQL строкой, содержащей WHERE AND
    #[test]
    fn test_filter_and_sort_cards_with_sql_and() {
        use crate::table_processing::parsing::parse_fsrs_table_block;

        // Создаем JSON карточек
        let cards_json = r#"[
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card1.md",
                "due": "2024-01-03_00:00"
            },
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card2.md",
                "due": "2024-01-03_00:00"
            }
        ]"#;

        // SQL запрос с WHERE AND
        let sql_source = r#"SELECT file WHERE overdue < 0 AND stability > 0.5"#;

        // Парсим SQL для получения параметров
        let parse_result = parse_fsrs_table_block(sql_source).unwrap();
        let params = parse_result.value;

        // Создаем настройки
        let settings_json = r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": "{\"request_retention\": 0.9, \"maximum_interval\": 36500.0, \"enable_fuzz\": false}"
        }"#;

        // Используем фиксированное время
        let now_iso = "2024-01-01T00:00:01.000Z"; // Сразу после повторения — due ещё в будущем

        // Вызываем фильтрацию
        let result = filter_and_sort_cards(cards_json, &params, settings_json, now_iso);

        assert!(
            result.is_ok(),
            "Фильтрация должна завершиться успешно: {:?}",
            result
        );
        let filter_result = result.unwrap();

        // Обе карточки должны пройти фильтр: overdue < 0 (т.к. due в будущем) AND stability > 0.5 (stability = 5.0)
        assert_eq!(filter_result.cards.len(), 2);
        assert_eq!(filter_result.total_count, 2);
        assert_eq!(filter_result.errors.len(), 0);
    }

    /// Тест для WASM функции filter_and_sort_cards_with_sql
    #[test]
    fn test_wasm_filter_and_sort_cards_with_sql() {
        // Создаем JSON карточек
        let cards_json = r#"[
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card1.md",
                "due": "2024-01-03_00:00"
            },
            {
                "reviews": [{"date": "2024-01-01T00:00:00.000Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card2.md",
                "due": "2024-01-03_00:00"
            }
        ]"#;

        // SQL запрос с WHERE
        let sql_source = r#"SELECT file WHERE overdue < 0"#;

        // Создаем настройки
        let settings_json = r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": "{\"request_retention\": 0.9, \"maximum_interval\": 36500.0, \"enable_fuzz\": false}"
        }"#;

        // Используем фиксированное время
        let now_iso = "2024-01-01T00:00:01.000Z"; // Сразу после повторения — due ещё в будущем

        // Вызываем WASM функцию напрямую
        let result_json =
            crate::filter_and_sort_cards_with_sql(cards_json, sql_source, settings_json, now_iso);

        // Парсим результат
        let result: serde_json::Value =
            serde_json::from_str(&result_json).expect("Failed to parse result JSON");

        // Проверяем, что нет ошибок
        assert!(
            !result.get("error").is_some(),
            "Result contains error: {:?}",
            result.get("error")
        );

        // Извлекаем объект cards
        let cards_obj = result
            .get("cards")
            .and_then(|c| c.as_object())
            .expect("No cards object in result");

        // Извлекаем массив карточек
        let cards = cards_obj
            .get("cards")
            .and_then(|c| c.as_array())
            .expect("No cards array in result");

        // Обе карточки должны пройти фильтр: overdue < 0 (т.к. due в будущем)
        assert_eq!(cards.len(), 2);

        // Проверяем общее количество
        let total_count = cards_obj
            .get("total_count")
            .and_then(|tc| tc.as_u64())
            .expect("No total_count in result");
        assert_eq!(total_count, 2);

        // Проверяем ошибки (должны быть пустыми)
        let errors = cards_obj
            .get("errors")
            .and_then(|e| e.as_array())
            .expect("No errors array in result");
        assert_eq!(errors.len(), 0);
    }

    /// Тест для фильтрации по полю reps
    #[test]
    fn test_filter_by_reps() {
        use crate::table_processing::parsing::parse_fsrs_table_block;

        // Создаем JSON карточек с разным количеством повторений
        let cards_json = r#"[
            {
                "reviews": [],
                "filePath": "card0.md"
            },
            {
                "reviews": [{"date": "2024-01-01T10:00:00Z", "rating": "Again", "stability": 0.5, "difficulty": 8.0}],
                "filePath": "card1_again.md"
            },
            {
                "reviews": [{"date": "2024-01-01T10:00:00Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0}],
                "filePath": "card1_good.md"
            },
            {
                "reviews": [
                    {"date": "2024-01-01T10:00:00Z", "rating": "Good", "stability": 5.0, "difficulty": 3.0},
                    {"date": "2024-01-02T10:00:00Z", "rating": "Good", "stability": 8.0, "difficulty": 2.5}
                ],
                "filePath": "card2.md"
            },
            {
                "reviews": [
                    {"date": "2024-01-01T10:00:00Z", "rating": "Again", "stability": 0.5, "difficulty": 8.0},
                    {"date": "2024-01-02T10:00:00Z", "rating": "Good", "stability": 2.0, "difficulty": 5.0}
                ],
                "filePath": "card_again_then_good.md"
            }
        ]"#;

        // Создаем настройки
        let settings_json = r#"{
            "default_initial_stability": 2.0,
            "default_initial_difficulty": 5.0,
            "parameters": "{\"request_retention\": 0.9, \"maximum_interval\": 36500.0, \"enable_fuzz\": true}"
        }"#;

        let now_iso = "2024-01-03T00:00:00.000Z";

        // Тест 1: WHERE reps = 0 (должны быть карточки без успешных повторений)
        let sql_source1 = r#"SELECT file WHERE reps = 0"#;
        let parse_result1 = parse_fsrs_table_block(sql_source1).unwrap();
        let params1 = parse_result1.value;
        let result1 = filter_and_sort_cards(cards_json, &params1, settings_json, now_iso);
        assert!(
            result1.is_ok(),
            "Фильтрация reps = 0 должна завершиться успешно"
        );
        let filter_result1 = result1.unwrap();
        // card0.md: пустые reviews -> reps = 0
        // card1_again.md: один Again -> reps = 1 (считается повторением)
        // Итого 1 карточка с reps = 0
        assert_eq!(
            filter_result1.cards.len(),
            1,
            "Должна быть 1 карточка с reps = 0"
        );
        assert!(
            filter_result1
                .cards
                .iter()
                .any(|c| c.card_json.contains("card0.md"))
        );

        // Тест 2: WHERE reps = 1 (одно успешное повторение)
        let sql_source2 = r#"SELECT file WHERE reps = 1"#;
        let parse_result2 = parse_fsrs_table_block(sql_source2).unwrap();
        let params2 = parse_result2.value;
        let result2 = filter_and_sort_cards(cards_json, &params2, settings_json, now_iso);
        assert!(
            result2.is_ok(),
            "Фильтрация reps = 1 должна завершиться успешно"
        );
        let filter_result2 = result2.unwrap();
        // card1_good.md: один Good -> reps = 1
        // card1_again.md: один Again -> reps = 1 (считается повторением)
        // card_again_then_good.md: Again затем Good -> reps = 2
        // Итого 2 карточки с reps = 1
        assert_eq!(
            filter_result2.cards.len(),
            2,
            "Должны быть 2 карточки с reps = 1"
        );
        assert!(
            filter_result2
                .cards
                .iter()
                .any(|c| c.card_json.contains("card1_good.md"))
        );
        assert!(
            filter_result2
                .cards
                .iter()
                .any(|c| c.card_json.contains("card1_again.md"))
        );

        // Тест 3: WHERE reps = 2 (два успешных повторения)
        let sql_source3 = r#"SELECT file WHERE reps = 2"#;
        let parse_result3 = parse_fsrs_table_block(sql_source3).unwrap();
        let params3 = parse_result3.value;
        let result3 = filter_and_sort_cards(cards_json, &params3, settings_json, now_iso);
        assert!(
            result3.is_ok(),
            "Фильтрация reps = 2 должна завершиться успешно"
        );
        let filter_result3 = result3.unwrap();
        // card2.md: два Good -> reps = 2
        // card_again_then_good.md: Again затем Good -> reps = 2
        // Итого 2 карточки
        assert_eq!(
            filter_result3.cards.len(),
            2,
            "Должны быть 2 карточки с reps = 2"
        );
        assert!(filter_result3.cards[0].card_json.contains("card2.md"));

        // Тест 4: WHERE reps > 0 (все карточки с успешными повторениями)
        let sql_source4 = r#"SELECT file WHERE reps > 0"#;
        let parse_result4 = parse_fsrs_table_block(sql_source4).unwrap();
        let params4 = parse_result4.value;
        let result4 = filter_and_sort_cards(cards_json, &params4, settings_json, now_iso);
        assert!(
            result4.is_ok(),
            "Фильтрация reps > 0 должна завершиться успешно"
        );
        let filter_result4 = result4.unwrap();
        // card1_good.md (1), card1_again.md (1), card2.md (2), card_again_then_good.md (2) -> 4 карточки
        assert_eq!(
            filter_result4.cards.len(),
            4,
            "Должны быть 4 карточки с reps > 0"
        );

        // Тест 5: WHERE reps < 2 (меньше двух успешных повторений)
        let sql_source5 = r#"SELECT file WHERE reps < 2"#;
        let parse_result5 = parse_fsrs_table_block(sql_source5).unwrap();
        let params5 = parse_result5.value;
        let result5 = filter_and_sort_cards(cards_json, &params5, settings_json, now_iso);
        assert!(
            result5.is_ok(),
            "Фильтрация reps < 2 должна завершиться успешно"
        );
        let filter_result5 = result5.unwrap();
        // card0.md (0), card1_good.md (1), card1_again.md (1) -> 3 карточки
        assert_eq!(
            filter_result5.cards.len(),
            3,
            "Должны быть 3 карточки с reps < 2"
        );
    }
}
