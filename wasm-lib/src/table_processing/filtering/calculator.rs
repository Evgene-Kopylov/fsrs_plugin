//! Модуль для вычисления значений полей карточек для сортировки в таблице FSRS
//! Включает вычисление overdue, retrievability, state и других полей
//! Использует существующие WASM функции для вычислений

use log;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::json_parsing::parse_datetime_flexible;
use crate::types::{ComputedState, ModernFsrsCard};

/// Вычисленные поля карточки для сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardWithComputedFields {
    /// Имя файла (строка)
    pub file: Option<String>,
    /// Количество повторений (число)
    pub reps: Option<u32>,
    /// Просрочка в часах (число с плавающей точкой)
    pub overdue: Option<f64>,
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

/// Ошибки вычислений
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CalculationError {
    /// Ошибка парсинга JSON карточки
    JsonParseError(String),
    /// Некорректный формат даты
    InvalidDateFormat(String),
    /// Отсутствует обязательное поле
    MissingField(String),
    /// Ошибка вычисления
    CalculationFailed(String),
    /// Ошибка парсинга JSON результата WASM
    WasmResultParseError(String),
    /// Функция не реализована
    NotImplemented,
}

impl std::fmt::Display for CalculationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CalculationError::JsonParseError(msg) => write!(f, "Ошибка парсинга JSON: {}", msg),
            CalculationError::InvalidDateFormat(msg) => {
                write!(f, "Некорректный формат даты: {}", msg)
            }
            CalculationError::MissingField(field) => {
                write!(f, "Отсутствует обязательное поле: {}", field)
            }
            CalculationError::CalculationFailed(msg) => write!(f, "Ошибка вычисления: {}", msg),
            CalculationError::WasmResultParseError(msg) => {
                write!(f, "Ошибка парсинга результата WASM: {}", msg)
            }
            CalculationError::NotImplemented => write!(f, "Функция не реализована"),
        }
    }
}

impl std::error::Error for CalculationError {}

pub fn calculate_overdue_from_due_str(
    due_str: Option<&str>,
    now_iso: &str,
) -> Result<f64, CalculationError> {
    use crate::sort_functions::get_overdue_hours;

    log::debug!(
        "calculate_overdue_from_due_str вызвана: due_str={:?}, now_iso={}",
        due_str,
        now_iso
    );
    log::debug!(
        "Вычисление просрочки из due_str: {:?}, now_iso: {}",
        due_str,
        now_iso
    );

    // Если due_str отсутствует, значит карточка не имеет даты просрочки
    let due_str = match due_str {
        Some(s) => s,
        None => {
            log::debug!("due_str отсутствует, просрочка = 0");
            log::debug!("due_str отсутствует, просрочка = 0");
            return Ok(0.0);
        }
    };

    log::debug!("due_str значение: '{}' (длина: {})", due_str, due_str.len());
    log::debug!("Значение due_str: '{}' (длина: {})", due_str, due_str.len());

    // Пытаемся распарсить дату using гибкой функции парсинга
    let due_dt = parse_datetime_flexible(due_str).ok_or_else(|| {
        log::warn!("Некорректный формат даты due: '{}'", due_str);
        log::debug!("Некорректный формат даты due: '{}'", due_str);
        log::debug!(
            "Пытаемся проверить формат Obsidian (YYYY-MM-DD_HH:MM): {}",
            due_str
        );

        // Проверяем, является ли это уже ISO форматом
        if due_str.contains('T') {
            log::debug!("Строка содержит 'T', возможно это уже ISO формат");
            log::debug!("Строка содержит 'T', возможно это уже ISO формат");
        } else {
            log::debug!("Строка не содержит 'T', формат Obsidian ожидается");
            log::debug!("Строка не содержит 'T', формат Obsidian ожидается");
        }

        CalculationError::InvalidDateFormat(format!("Некорректный формат даты due: {}", due_str))
    })?;

    let due_iso = due_dt.to_rfc3339();

    log::debug!("Преобразованная due_iso: '{}'", due_iso);
    log::debug!("Преобразованная due_iso: '{}'", due_iso);

    // Вызываем существующую WASM функцию для вычисления просрочки
    log::debug!(
        "Вызов get_overdue_hours с due_iso='{}', now_iso='{}'",
        due_iso,
        now_iso
    );
    log::debug!(
        "Вызов get_overdue_hours с due_iso='{}', now_iso='{}'",
        due_iso,
        now_iso
    );
    let overdue_json = get_overdue_hours(due_iso.clone(), now_iso.to_string());

    log::debug!("Результат get_overdue_hours: '{}'", overdue_json);
    log::debug!(
        "Результат get_overdue_hours (первые 100 символов): '{}'",
        &overdue_json[..overdue_json.len().min(100)]
    );
    log::debug!("Результат get_overdue_hours полный: '{}'", overdue_json);

    // Парсим результат
    let overdue: f64 = serde_json::from_str(&overdue_json).map_err(|e| {
        log::warn!(
            "Ошибка парсинга результата overdue: {}, json: '{}'",
            e,
            overdue_json
        );
        log::debug!(
            "Ошибка парсинга результата overdue: {}, json: '{}'",
            e,
            overdue_json
        );
        CalculationError::WasmResultParseError(e.to_string())
    })?;

    log::debug!(
        "Просрочка вычислена: {} часов ({} дней)",
        overdue,
        overdue / 24.0
    );
    log::debug!(
        "Просрочка вычислена: {} часов ({} дней)",
        overdue,
        overdue / 24.0
    );

    // Логируем дополнительную информацию для отладки
    if overdue == 0.0 {
        log::warn!("ВНИМАНИЕ: overdue = 0.0, это может указывать на проблему");
        log::debug!("ВНИМАНИЕ: overdue = 0.0, это может указывать на проблему");
        log::debug!(
            "due_str: '{}', due_iso: '{}', now_iso: '{}'",
            due_str,
            due_iso,
            now_iso
        );
    } else {
        log::debug!(
            "overdue успешно вычислен: {} (возвращаем это значение)",
            overdue
        );
    }

    Ok(overdue)
}

/// Вычисляет поля карточки из готового состояния (без вызова compute_current_state)
pub fn compute_fields_from_state(
    card: &ModernFsrsCard,
    state: &ComputedState,
    now_iso: &str,
) -> CardWithComputedFields {
    let mut result = CardWithComputedFields {
        file: card.file_path.clone(),
        reps: Some(state.reps as u32),
        overdue: None,
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

    // Вычисляем overdue
    match calculate_overdue_from_due_str(Some(&state.due), now_iso) {
        Ok(overdue) => result.overdue = Some(overdue),
        Err(e) => {
            log::warn!("Ошибка вычисления overdue из состояния: {}", e);
            result.overdue = None;
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculation_error_display() {
        let errors = vec![
            CalculationError::JsonParseError("invalid json".to_string()),
            CalculationError::InvalidDateFormat("2024-01-01".to_string()),
            CalculationError::MissingField("due".to_string()),
            CalculationError::CalculationFailed("division by zero".to_string()),
            CalculationError::WasmResultParseError("parse error".to_string()),
            CalculationError::NotImplemented,
        ];

        let displays: Vec<String> = errors.iter().map(|e| e.to_string()).collect();

        assert!(displays[0].contains("Ошибка парсинга JSON"));
        assert!(displays[1].contains("Некорректный формат даты"));
        assert!(displays[2].contains("Отсутствует обязательное поле"));
        assert!(displays[3].contains("Ошибка вычисления"));
        assert!(displays[4].contains("Ошибка парсинга результата WASM"));
        assert!(displays[5].contains("Функция не реализована"));
    }
}
