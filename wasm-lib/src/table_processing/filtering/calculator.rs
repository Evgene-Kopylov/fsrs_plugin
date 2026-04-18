//! Модуль для вычисления значений полей карточек для сортировки в таблице FSRS
//! Включает вычисление overdue, retrievability, state и других полей

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    /// Функция не реализована
    NotImplemented,
}

impl std::fmt::Display for CalculationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CalculationError::JsonParseError(msg) => write!(f, "Ошибка парсинга JSON: {}", msg),
            CalculationError::InvalidDateFormat(msg) => write!(f, "Некорректный формат даты: {}", msg),
            CalculationError::MissingField(field) => write!(f, "Отсутствует обязательное поле: {}", field),
            CalculationError::CalculationFailed(msg) => write!(f, "Ошибка вычисления: {}", msg),
            CalculationError::NotImplemented => write!(f, "Функция не реализована"),
        }
    }
}

impl std::error::Error for CalculationError {}

/// Вычисляет просрочку карточки в часах
///
/// # Аргументы
/// * `card_json` - JSON карточки
/// * `now_iso` - текущее время в формате ISO 8601
///
/// # Возвращает
/// Количество часов просрочки или ошибку вычисления
///
/// # TODO
/// Реализовать фактическое вычисление с использованием существующих функций WASM
pub fn calculate_overdue(card_json: &str, now_iso: &str) -> Result<f64, CalculationError> {
    // TODO: Использовать существующую функцию WASM для вычисления просрочки
    // Временная заглушка: возвращаем 0.0
    log::debug!("calculate_overdue заглушка: card_json длина={}, now_iso={}", card_json.len(), now_iso);
    Ok(0.0)
}

/// Вычисляет извлекаемость (retrievability) карточки
///
/// # Аргументы
/// * `card_json` - JSON карточки
/// * `now_iso` - текущее время в формате ISO 8601
/// * `parameters_json` - JSON параметров FSRS
/// * `default_stability` - стабильность по умолчанию
/// * `default_difficulty` - сложность по умолчанию
///
/// # Возвращает
/// Значение извлекаемости от 0 до 1 или ошибку вычисления
///
/// # TODO
/// Использовать существующую функцию WASM `get_retrievability`
pub fn calculate_retrievability(
    card_json: &str,
    now_iso: &str,
    parameters_json: &str,
    default_stability: f64,
    default_difficulty: f64,
) -> Result<f64, CalculationError> {
    // TODO: Использовать существующую функцию WASM get_retrievability
    // Временная заглушка: возвращаем 0.5
    log::debug!(
        "calculate_retrievability заглушка: card_json длина={}, now_iso={}",
        card_json.len(),
        now_iso
    );
    Ok(0.5)
}

/// Определяет состояние карточки (новое, изучение, повторение, пересмотр)
///
/// # Аргументы
/// * `card_json` - JSON карточки
/// * `now_iso` - текущее время в формате ISO 8601
/// * `parameters_json` - JSON параметров FSRS
/// * `default_stability` - стабильность по умолчанию
/// * `default_difficulty` - сложность по умолчанию
///
/// # Возвращает
/// Строку с состоянием карточки или ошибку вычисления
///
/// # TODO
/// Использовать существующую функцию WASM `compute_current_state`
pub fn calculate_card_state(
    card_json: &str,
    now_iso: &str,
    parameters_json: &str,
    default_stability: f64,
    default_difficulty: f64,
) -> Result<String, CalculationError> {
    // TODO: Использовать существующую функцию WASM compute_current_state
    // Временная заглушка: возвращаем "new"
    log::debug!(
        "calculate_card_state заглушка: card_json длина={}, now_iso={}",
        card_json.len(),
        now_iso
    );
    Ok("new".to_string())
}

/// Извлекает поле из JSON карточки
///
/// # Аргументы
/// * `card_json` - JSON карточки
/// * `field` - имя поля для извлечения
///
/// # Возвращает
/// Значение поля как JSON или ошибку
fn extract_field(card_json: &str, field: &str) -> Result<serde_json::Value, CalculationError> {
    let parsed: serde_json::Value = serde_json::from_str(card_json)
        .map_err(|e| CalculationError::JsonParseError(e.to_string()))?;

    parsed.get(field)
        .cloned()
        .ok_or_else(|| CalculationError::MissingField(field.to_string()))
}

/// Вычисляет все поля для карточки
///
/// # Аргументы
/// * `card_json` - JSON карточки
/// * `now_iso` - текущее время в формате ISO 8601
/// * `parameters_json` - JSON параметров FSRS
/// * `default_stability` - стабильность по умолчанию
/// * `default_difficulty` - сложность по умолчанию
///
/// # Возвращает
/// Структуру с вычисленными полями или ошибку
pub fn compute_all_fields(
    card_json: &str,
    now_iso: &str,
    parameters_json: &str,
    default_stability: f64,
    default_difficulty: f64,
) -> Result<CardWithComputedFields, CalculationError> {
    log::debug!("Вычисление полей для карточки: длина JSON={}", card_json.len());

    let mut result = CardWithComputedFields {
        file: None,
        reps: None,
        overdue: None,
        stability: None,
        difficulty: None,
        retrievability: None,
        due: None,
        state: None,
        elapsed: None,
        scheduled: None,
        additional_fields: HashMap::new(),
    };

    // Пытаемся извлечь базовые поля из JSON
    if let Ok(file_value) = extract_field(card_json, "file") {
        if let Some(file_str) = file_value.as_str() {
            result.file = Some(file_str.to_string());
        }
    }

    if let Ok(reps_value) = extract_field(card_json, "reps") {
        if let Some(reps) = reps_value.as_u64() {
            result.reps = Some(reps as u32);
        }
    }

    if let Ok(stability_value) = extract_field(card_json, "stability") {
        if let Some(stability) = stability_value.as_f64() {
            result.stability = Some(stability);
        }
    }

    if let Ok(difficulty_value) = extract_field(card_json, "difficulty") {
        if let Some(difficulty) = difficulty_value.as_f64() {
            result.difficulty = Some(difficulty);
        }
    }

    if let Ok(due_value) = extract_field(card_json, "due") {
        if let Some(due_str) = due_value.as_str() {
            result.due = Some(due_str.to_string());
        }
    }

    // Вычисляем сложные поля (заглушки)
    result.overdue = Some(calculate_overdue(card_json, now_iso)?);
    result.retrievability = Some(calculate_retrievability(
        card_json,
        now_iso,
        parameters_json,
        default_stability,
        default_difficulty,
    )?);
    result.state = Some(calculate_card_state(
        card_json,
        now_iso,
        parameters_json,
        default_stability,
        default_difficulty,
    )?);

    log::debug!("Вычисление полей завершено успешно");
    Ok(result)
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
            CalculationError::NotImplemented,
        ];

        let displays: Vec<String> = errors.iter().map(|e| e.to_string()).collect();

        assert!(displays[0].contains("Ошибка парсинга JSON"));
        assert!(displays[1].contains("Некорректный формат даты"));
        assert!(displays[2].contains("Отсутствует обязательное поле"));
        assert!(displays[3].contains("Ошибка вычисления"));
        assert!(displays[4].contains("Функция не реализована"));
    }

    #[test]
    fn test_calculate_overdue_stub() {
        let card_json = r#"{"file": "test.md", "due": "2024-01-01"}"#;
        let now_iso = "2024-01-02T10:00:00Z";

        let result = calculate_overdue(card_json, now_iso);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0.0); // Заглушка возвращает 0.0
    }

    #[test]
    fn test_calculate_retrievability_stub() {
        let card_json = r#"{"file": "test.md"}"#;
        let now_iso = "2024-01-01T10:00:00Z";
        let parameters_json = r#"{"request_retention": 0.9}"#;

        let result = calculate_retrievability(card_json, now_iso, parameters_json, 1.0, 0.5);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 0.5); // Заглушка возвращает 0.5
    }

    #[test]
    fn test_calculate_card_state_stub() {
        let card_json = r#"{"file": "test.md"}"#;
        let now_iso = "2024-01-01T10:00:00Z";
        let parameters_json = r#"{"request_retention": 0.9}"#;

        let result = calculate_card_state(card_json, now_iso, parameters_json, 1.0, 0.5);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "new"); // Заглушка возвращает "new"
    }

    #[test]
    fn test_extract_field_success() {
        let card_json = r#"{"file": "test.md", "reps": 5}"#;

        let file_result = extract_field(card_json, "file");
        assert!(file_result.is_ok());
        assert_eq!(file_result.unwrap().as_str().unwrap(), "test.md");

        let reps_result = extract_field(card_json, "reps");
        assert!(reps_result.is_ok());
        assert_eq!(reps_result.unwrap().as_u64().unwrap(), 5);
    }

    #[test]
    fn test_extract_field_missing() {
        let card_json = r#"{"file": "test.md"}"#;

        let result = extract_field(card_json, "nonexistent");
        assert!(result.is_err());

        if let Err(CalculationError::MissingField(field)) = result {
            assert_eq!(field, "nonexistent");
        } else {
            panic!("Expected MissingField error");
        }
    }

    #[test]
    fn test_extract_field_invalid_json() {
        let card_json = r#"{"file": "test.md"#; // Незакрытая JSON строка

        let result = extract_field(card_json, "file");
        assert!(result.is_err());

        if let Err(CalculationError::JsonParseError(_)) = result {
            // Ожидаемая ошибка
        } else {
            panic!("Expected JsonParseError");
        }
    }

    #[test]
    fn test_compute_all_fields_stub() {
        let card_json = r#"{"file": "test.md", "reps": 3, "stability": 2.5, "difficulty": 0.7, "due": "2024-01-10_10:30"}"#;
        let now_iso = "2024-01-01T10:00:00Z";
        let parameters_json = r#"{"request_retention": 0.9}"#;

        let result = compute_all_fields(card_json, now_iso, parameters_json, 1.0, 0.5);
        assert!(result.is_ok());

        let computed = result.unwrap();
        assert_eq!(computed.file, Some("test.md".to_string()));
        assert_eq!(computed.reps, Some(3));
        assert_eq!(computed.stability, Some(2.5));
        assert_eq!(computed.difficulty, Some(0.7));
        assert_eq!(computed.due, Some("2024-01-10_10:30".to_string()));
        assert_eq!(computed.overdue, Some(0.0)); // Заглушка
        assert_eq!(computed.retrievability, Some(0.5)); // Заглушка
        assert_eq!(computed.state, Some("new".to_string())); // Заглушка
    }
}
