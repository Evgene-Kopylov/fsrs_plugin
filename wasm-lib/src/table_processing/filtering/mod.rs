//! Модуль фильтрации и сортировки карточек для таблицы FSRS
//! Включает вычисление значений для сортировки, алгоритмы сортировки и фильтрацию

// Подмодули
mod calculator;
mod sorter;

// Реэкспорт публичных функций и типов
pub use calculator::{
    calculate_overdue,
    calculate_retrievability,
    calculate_card_state,
    CardWithComputedFields,
};
pub use sorter::{
    sort_cards_by_field,
    FilterError,
    SortError,
};

use serde::{Deserialize, Serialize};
use crate::table_processing::types::TableParams;

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
    // TODO: Реализовать после завершения подмодулей calculator и sorter
    Err(FilterError::NotImplemented)
}

/// Вспомогательная функция для преобразования результата в JSON
pub fn filter_and_sort_cards_json(
    cards_json: &str,
    params_json: &str,
    settings_json: &str,
    now_iso: &str,
) -> String {
    match serde_json::from_str(params_json) {
        Ok(params) => {
            match filter_and_sort_cards(cards_json, &params, settings_json, now_iso) {
                Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()),
                Err(err) => serde_json::to_string(&serde_json::json!({
                    "error": err.to_string(),
                    "cards": []
                })).unwrap_or_else(|_| "{}".to_string()),
            }
        }
        Err(err) => {
            serde_json::to_string(&serde_json::json!({
                "error": format!("Ошибка парсинга параметров: {}", err),
                "cards": []
            })).unwrap_or_else(|_| "{}".to_string())
        }
    }
}
