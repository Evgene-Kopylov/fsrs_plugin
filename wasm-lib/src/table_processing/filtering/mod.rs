//! Модуль фильтрации и сортировки карточек для таблицы FSRS
//! Включает вычисление значений для сортировки, алгоритмы сортировки и фильтрацию

// Подмодули
mod calculator;
mod evaluator;
mod sorter;

// Реэкспорт публичных функций и типов
pub use calculator::CardWithComputedFields;
pub use sorter::FilterError;

use crate::table_processing::types::{SortDirection, SortParam, TableParams};
use crate::types::{CardData, ComputedState};
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
/// Принимает срез пар (CardData, ComputedState) — без JSON-сериализации на входе
pub fn filter_and_sort_cards_with_states(
    cards: &[(CardData, ComputedState)],
    params: &TableParams,
    _settings_json: &str,
    now_iso: &str,
) -> Result<FilterSortResult, FilterError> {
    debug!(
        "Начало фильтрации и сортировки {} карточек с готовыми состояниями",
        cards.len()
    );

    let mut computed_fields_list: Vec<(CardWithComputedFields, &CardData)> = Vec::new();

    // Обрабатываем каждую пару — только вычисляем поля, без сериализации
    for (card, state) in cards {
        let computed_fields = calculator::compute_fields_from_state(card, state, now_iso);
        computed_fields_list.push((computed_fields, card));
    }

    debug!(
        "Вычислены поля для {} карточек с готовыми состояниями",
        computed_fields_list.len()
    );

    // Применяем фильтрацию WHERE если указана
    if let Some(condition) = &params.where_condition {
        info!("Применение фильтрации WHERE для карточек с готовыми состояниями");
        computed_fields_list.retain(|(fields, _)| {
            match crate::table_processing::filtering::evaluator::evaluate_condition(
                condition, fields,
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
            computed_fields_list.len()
        );
    }

    // Применяем сортировку
    // Если ORDER BY не указан, сортируем по retrievability ASC (самые забытые сверху)
    let default_sort = SortParam {
        field: "retrievability".to_string(),
        direction: SortDirection::Asc,
    };
    let sort = params.sort.as_ref().unwrap_or(&default_sort);

    debug!(
        "Применение сортировки по полю '{}' для карточек с готовыми состояниями",
        sort.field
    );
    computed_fields_list
        .sort_by(|(a, _), (b, _)| compare_computed_fields(a, b, &sort.field, sort.direction));

    let total_count = computed_fields_list.len();

    // Применяем лимит если указан
    let limited = if params.limit > 0 && params.limit < computed_fields_list.len() {
        &computed_fields_list[0..params.limit]
    } else {
        &computed_fields_list[..]
    };

    // Сериализуем в JSON только те карточки, которые попали в результат
    let cards: Result<Vec<ComputedCard>, _> = limited
        .iter()
        .map(|(fields, card)| {
            let card_json_str = serde_json::to_string(card).map_err(|e| {
                FilterError::JsonParseError(format!("Ошибка сериализации карточки: {}", e))
            })?;
            Ok(ComputedCard {
                card_json: card_json_str,
                computed_fields: fields.clone(),
            })
        })
        .collect();

    let limited_cards = cards?;

    debug!(
        "Фильтрация и сортировка карточек с готовыми состояниями завершена: {} карточек (лимит {}), всего {}",
        limited_cards.len(),
        params.limit,
        total_count
    );

    Ok(FilterSortResult {
        cards: limited_cards,
        total_count,
        errors: vec![],
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
