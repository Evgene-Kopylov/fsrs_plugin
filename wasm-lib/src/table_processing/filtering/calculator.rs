//! Модуль для вычисления значений полей карточек для сортировки в таблице FSRS
//! Включает вычисление retrievability, state и других полей
//! Использует существующие WASM функции для вычислений

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::json_parsing::parse_datetime_flexible;
use crate::types::{CardData, ComputedState};

/// Вычисленные поля карточки для сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardWithComputedFields {
    /// Имя файла (строка)
    pub file: Option<String>,
    /// Количество повторений (число)
    pub reps: Option<u32>,
    /// Стабильность (число с плавающей точкой)
    pub stability: Option<f64>,
    /// Сложность (число с плавающей точкой)
    pub difficulty: Option<f64>,
    /// Извлекаемость (число с плавающей точкой, 0-1)
    pub retrievability: Option<f64>,
    /// Дата следующего повторения в формате Obsidian (строка)
    pub due: Option<String>,
    /// Состояние карточки (строка)
    pub state: Option<String>,
    /// Прошло дней с последнего повторения (число с плавающей точкой)
    pub elapsed: Option<f64>,
    /// Запланировано дней до следующего повторения (число с плавающей точкой)
    pub scheduled: Option<f64>,
    /// Дополнительные вычисленные поля
    pub additional_fields: HashMap<String, serde_json::Value>,
}

pub fn compute_fields_from_state(
    card: &CardData,
    state: &ComputedState,
    _now_iso: &str,
) -> CardWithComputedFields {
    let mut result = CardWithComputedFields {
        file: card.file_path.clone(),
        reps: Some(state.reps as u32),
        stability: Some(state.stability),
        difficulty: Some(state.difficulty),
        retrievability: Some(state.retrievability),
        due: None,
        state: Some(state.state.clone()),
        elapsed: Some(state.elapsed_days as f64),
        scheduled: Some(state.scheduled_days as f64),
        additional_fields: HashMap::new(),
    };

    // Добавляем lapses в дополнительные поля
    result.additional_fields.insert(
        "lapses".to_string(),
        serde_json::Value::Number(state.lapses.into()),
    );

    // Преобразуем due из ISO в формат Obsidian
    if let Some(due_dt) = parse_datetime_flexible(&state.due) {
        result.due = Some(due_dt.format("%Y-%m-%d_%H:%M").to_string());
    } else {
        result.due = Some(state.due.clone());
    }

    result
}
