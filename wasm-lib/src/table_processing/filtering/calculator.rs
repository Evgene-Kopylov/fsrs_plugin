//! Модуль для вычисления значений полей карточек для сортировки в таблице FSRS
//! Включает вычисление overdue, retrievability, state и других полей
//! Использует существующие WASM функции для вычислений

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use log;

use crate::json_parsing::parse_datetime_flexible;

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
            CalculationError::InvalidDateFormat(msg) => write!(f, "Некорректный формат даты: {}", msg),
            CalculationError::MissingField(field) => write!(f, "Отсутствует обязательное поле: {}", field),
            CalculationError::CalculationFailed(msg) => write!(f, "Ошибка вычисления: {}", msg),
            CalculationError::WasmResultParseError(msg) => write!(f, "Ошибка парсинга результата WASM: {}", msg),
            CalculationError::NotImplemented => write!(f, "Функция не реализована"),
        }
    }
}

impl std::error::Error for CalculationError {}

/// Преобразует дату из формата Obsidian (ГГГГ-ММ-ДД_чч:мм) в ISO 8601
pub fn obsidian_to_iso(date_str: &str) -> Option<String> {
    // Формат Obsidian: "2024-01-10_10:30"
    // Преобразуем в ISO 8601: "2024-01-10T10:30:00Z"

    if date_str.is_empty() {
        return None;
    }

    // Пытаемся распарсить как Obsidian формат
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y-%m-%d_%H:%M") {
        // Преобразуем в DateTime<Utc> и затем в ISO 8601
        let dt_utc: DateTime<Utc> = DateTime::from_naive_utc_and_offset(dt, Utc);
        Some(dt_utc.to_rfc3339())
    } else {
        // Если не удалось, пробуем как ISO 8601 (возможно уже в правильном формате)
        // Пытаемся распарсить как ISO 8601 используя нашу гибкую функцию
        parse_datetime_flexible(date_str).map(|dt| dt.to_rfc3339())
    }
}

/// Преобразует дату из ISO 8601 в формат Obsidian (ГГГГ-ММ-ДД_чч:мм)
pub fn iso_to_obsidian(iso_str: &str) -> Option<String> {
    if iso_str.is_empty() {
        return None;
    }

    // Пытаемся распарсить как ISO 8601 используя нашу гибкую функцию
    if let Some(dt) = parse_datetime_flexible(iso_str) {
        // Форматируем в Obsidian формат
        Some(dt.format("%Y-%m-%d_%H:%M").to_string())
    } else {
        // Если уже в Obsidian формате, возвращаем как есть
        if iso_str.contains('_') && iso_str.contains('-') && iso_str.contains(':') {
            Some(iso_str.to_string())
        } else {
            None
        }
    }
}

/// Извлекает поле из JSON карточки
fn extract_field(card_json: &str, field: &str) -> Result<serde_json::Value, CalculationError> {
    let parsed: serde_json::Value = serde_json::from_str(card_json)
        .map_err(|e| CalculationError::JsonParseError(e.to_string()))?;

    parsed.get(field)
        .cloned()
        .ok_or_else(|| CalculationError::MissingField(field.to_string()))
}

/// Вычисляет просрочку карточки в часах
///
/// # Аргументы
/// * `card_json` - JSON карточки
/// * `now_iso` - текущее время в формате ISO 8601
///
/// # Возвращает
/// Количество часов просрочки или ошибку вычисления
pub fn calculate_overdue(card_json: &str, now_iso: &str) -> Result<f64, CalculationError> {
    use crate::sort_functions::get_overdue_hours;

    log::debug!("Вычисление просрочки для карточки");

    // Извлекаем поле due из карточки (может отсутствовать)
    let due_value = match extract_field(card_json, "due") {
        Ok(value) => value,
        Err(CalculationError::MissingField(_)) => {
            // Если поле due отсутствует, значит карточка не имеет даты просрочки
            log::debug!("Поле due отсутствует, просрочка = 0");
            return Ok(0.0);
        }
        Err(e) => return Err(e),
    };

    let due_str = due_value.as_str()
        .ok_or_else(|| CalculationError::MissingField("due".to_string()))?;

    // Преобразуем дату due из Obsidian формата в ISO 8601, если нужно
    let due_iso = obsidian_to_iso(due_str)
        .ok_or_else(|| CalculationError::InvalidDateFormat(format!("Некорректный формат даты due: {}", due_str)))?;

    // Вызываем существующую WASM функцию для вычисления просрочки
    let overdue_json = get_overdue_hours(due_iso, now_iso.to_string());

    // Парсим результат
    let overdue: f64 = serde_json::from_str(&overdue_json)
        .map_err(|e| CalculationError::WasmResultParseError(e.to_string()))?;

    log::debug!("Просрочка вычислена: {} часов", overdue);
    Ok(overdue)
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
pub fn calculate_retrievability(
    card_json: &str,
    now_iso: &str,
    parameters_json: &str,
    default_stability: f64,
    default_difficulty: f64,
) -> Result<f64, CalculationError> {
    use crate::state_functions::get_retrievability;

    log::debug!("Вычисление извлекаемости для карточки");

    // Вызываем существующую WASM функцию для вычисления извлекаемости
    let retrievability_json = get_retrievability(
        card_json.to_string(),
        now_iso.to_string(),
        parameters_json.to_string(),
        default_stability,
        default_difficulty,
    );

    // Парсим результат
    let retrievability: f64 = serde_json::from_str(&retrievability_json)
        .map_err(|e| CalculationError::WasmResultParseError(e.to_string()))?;

    log::debug!("Извлекаемость вычислена: {}", retrievability);
    Ok(retrievability)
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
pub fn calculate_card_state(
    card_json: &str,
    now_iso: &str,
    parameters_json: &str,
    default_stability: f64,
    default_difficulty: f64,
) -> Result<String, CalculationError> {
    use crate::state_functions::compute_current_state;

    log::debug!("Вычисление состояния карточки");

    // Вызываем существующую WASM функцию для вычисления состояния
    let state_json = compute_current_state(
        card_json.to_string(),
        now_iso.to_string(),
        parameters_json.to_string(),
        default_stability,
        default_difficulty,
    );

    // Парсим JSON результата
    let parsed: serde_json::Value = serde_json::from_str(&state_json)
        .map_err(|e| CalculationError::WasmResultParseError(e.to_string()))?;

    // Извлекаем поле state
    let state = parsed.get("state")
        .and_then(|s| s.as_str())
        .ok_or_else(|| CalculationError::WasmResultParseError("Поле 'state' отсутствует в результате".to_string()))?
        .to_string();

    log::debug!("Состояние карточки: {}", state);
    Ok(state)
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
    use crate::state_functions::compute_current_state;

    log::debug!("Вычисление всех полей для карточки: длина JSON={}", card_json.len());

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

    // Используем поле filePath как альтернативу file
    if result.file.is_none() {
        if let Ok(file_path_value) = extract_field(card_json, "filePath") {
            if let Some(file_path_str) = file_path_value.as_str() {
                result.file = Some(file_path_str.to_string());
            }
        }
    }

    // Извлекаем reps из истории reviews
    if let Ok(reviews_value) = extract_field(card_json, "reviews") {
        if let Some(reviews_array) = reviews_value.as_array() {
            // Подсчитываем количество успешных повторений (не "Again")
            let successful_reps = reviews_array.iter()
                .filter(|review| {
                    review.get("rating")
                        .and_then(|r| r.as_str())
                        .map(|r| r != "Again")
                        .unwrap_or(false)
                })
                .count();
            result.reps = Some(successful_reps as u32);
        }
    }

    // Вычисляем полное состояние карточки через WASM функцию
    let state_json = compute_current_state(
        card_json.to_string(),
        now_iso.to_string(),
        parameters_json.to_string(),
        default_stability,
        default_difficulty,
    );
    let parsed_state: serde_json::Value = serde_json::from_str(&state_json)
        .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()));

    // Извлекаем значения из результата compute_current_state
    if let Some(stability) = parsed_state.get("stability").and_then(|s| s.as_f64()) {
        result.stability = Some(stability);
    }

    if let Some(difficulty) = parsed_state.get("difficulty").and_then(|d| d.as_f64()) {
        result.difficulty = Some(difficulty);
    }

    if let Some(due_iso) = parsed_state.get("due").and_then(|d| d.as_str()) {
        // Преобразуем ISO дату в формат Obsidian для отображения
        if let Some(due_obsidian) = iso_to_obsidian(due_iso) {
            result.due = Some(due_obsidian);
        } else {
            result.due = Some(due_iso.to_string());
        }
    }

    if let Some(state_str) = parsed_state.get("state").and_then(|s| s.as_str()) {
        result.state = Some(state_str.to_string());
    }

    if let Some(elapsed_days) = parsed_state.get("elapsed_days").and_then(|e| e.as_u64()) {
        result.elapsed = Some(elapsed_days as f64);
    }

    if let Some(scheduled_days) = parsed_state.get("scheduled_days").and_then(|s| s.as_u64()) {
        result.scheduled = Some(scheduled_days as f64);
    }

    // Вычисляем сложные поля через соответствующие функции, с обработкой ошибок
    result.overdue = match calculate_overdue(card_json, now_iso) {
        Ok(value) => Some(value),
        Err(e) => {
            log::warn!("Ошибка вычисления просрочки: {}", e);
            None
        }
    };

    result.retrievability = match calculate_retrievability(
        card_json,
        now_iso,
        parameters_json,
        default_stability,
        default_difficulty,
    ) {
        Ok(value) => Some(value),
        Err(e) => {
            log::warn!("Ошибка вычисления извлекаемости: {}", e);
            None
        }
    };

    // Если состояние еще не установлено, вычисляем его отдельно
    if result.state.is_none() {
        result.state = match calculate_card_state(
            card_json,
            now_iso,
            parameters_json,
            default_stability,
            default_difficulty,
        ) {
            Ok(value) => Some(value),
            Err(e) => {
                log::warn!("Ошибка вычисления состояния: {}", e);
                None
            }
        };
    }

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

    #[test]
    fn test_obsidian_to_iso() {
        // Тест преобразования Obsidian формата в ISO
        let obsidian_date = "2024-01-10_10:30";
        let iso_date = obsidian_to_iso(obsidian_date);
        assert!(iso_date.is_some());
        let iso = iso_date.unwrap();
        assert!(iso.contains("2024-01-10T10:30:"));

        // Тест с уже ISO датой
        let iso_input = "2024-01-10T10:30:00Z";
        let iso_output = obsidian_to_iso(iso_input);
        assert!(iso_output.is_some());
        let output = iso_output.unwrap();
        // Проверяем что дата корректная, формат может быть с Z или +00:00
        assert!(output.contains("2024-01-10T10:30:00"));

        // Тест с пустой строкой
        assert!(obsidian_to_iso("").is_none());

        // Тест с некорректным форматом
        assert!(obsidian_to_iso("invalid date").is_none());
    }

    #[test]
    fn test_iso_to_obsidian() {
        // Тест преобразования ISO в Obsidian формат
        let iso_date = "2024-01-10T10:30:00Z";
        let obsidian_date = iso_to_obsidian(iso_date);
        assert!(obsidian_date.is_some());
        assert_eq!(obsidian_date.unwrap(), "2024-01-10_10:30");

        // Тест с уже Obsidian датой
        let obsidian_input = "2024-01-10_10:30";
        let obsidian_output = iso_to_obsidian(obsidian_input);
        assert!(obsidian_output.is_some());
        assert_eq!(obsidian_output.unwrap(), obsidian_input);

        // Тест с пустой строкой
        assert!(iso_to_obsidian("").is_none());

        // Тест с некорректным форматом
        assert!(iso_to_obsidian("invalid date").is_none());
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
}
