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
                    false
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
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
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
