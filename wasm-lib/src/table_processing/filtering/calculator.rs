//! Модуль для вычисления значений полей карточек для сортировки в таблице FSRS
//! Включает вычисление overdue, retrievability, state и других полей
//! Использует существующие WASM функции для вычислений

use log::{self, debug};
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

/// Извлекает поле из JSON карточки
fn extract_field(card_json: &str, field: &str) -> Result<serde_json::Value, CalculationError> {
    let parsed: serde_json::Value = serde_json::from_str(card_json)
        .map_err(|e| CalculationError::JsonParseError(e.to_string()))?;

    parsed
        .get(field)
        .cloned()
        .ok_or_else(|| CalculationError::MissingField(field.to_string()))
}

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
    use crate::current_state::get_retrievability;

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
    use crate::current_state::compute_current_state;

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
    let state = parsed
        .get("state")
        .and_then(|s| s.as_str())
        .ok_or_else(|| {
            CalculationError::WasmResultParseError(
                "Поле 'state' отсутствует в результате".to_string(),
            )
        })?
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
    use crate::current_state::compute_current_state;

    log::debug!(
        "Вычисление всех полей для карточки: длина JSON={}",
        card_json.len()
    );

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
    if let Ok(file_value) = extract_field(card_json, "file")
        && let Some(file_str) = file_value.as_str()
    {
        result.file = Some(file_str.to_string());
    }

    // Используем поле filePath как альтернативу file
    if result.file.is_none()
        && let Ok(file_path_value) = extract_field(card_json, "filePath")
        && let Some(file_path_str) = file_path_value.as_str()
    {
        result.file = Some(file_path_str.to_string());
    }

    // Извлекаем reps из истории reviews
    if let Ok(reviews_value) = extract_field(card_json, "reviews")
        && let Some(reviews_array) = reviews_value.as_array()
    {
        debug!("Извлечены reviews: {}", reviews_array.len());

        // Подсчитываем общее количество повторений (включая "Again")
        let total_reps = reviews_array.len();

        // Логируем рейтинги для отладки
        for (i, review) in reviews_array.iter().enumerate() {
            let rating = review
                .get("rating")
                .and_then(|r| r.as_str())
                .unwrap_or("Unknown");
            debug!("Review {}: rating = {}", i, rating);
        }

        debug!("Всего total_reps: {}", total_reps);
        result.reps = Some(total_reps as u32);
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
        if let Some(due_dt) = parse_datetime_flexible(due_iso) {
            result.due = Some(due_dt.format("%Y-%m-%d_%H:%M").to_string());
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

    if result.reps.is_none()
        && let Some(reps_value) = parsed_state.get("reps").and_then(|r| r.as_u64())
    {
        result.reps = Some(reps_value as u32);
    }

    if let Some(lapses_value) = parsed_state.get("lapses").and_then(|l| l.as_u64()) {
        result.additional_fields.insert(
            "lapses".to_string(),
            serde_json::Value::Number(lapses_value.into()),
        );
    }

    // Вычисляем сложные поля через соответствующие функции, с обработкой ошибок
    result.overdue = match calculate_overdue_from_due_str(result.due.as_deref(), now_iso) {
        Ok(value) => {
            log::debug!(
                "Установлено overdue для карточки: {} часов (файл: {:?})",
                value,
                result.file
            );
            Some(value)
        }
        Err(e) => {
            log::warn!("Ошибка вычисления overdue: {}", e);
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
    log::debug!(
        "Итоговое значение overdue: {:?} (файл: {:?}, due: {:?})",
        result.overdue,
        result.file,
        result.due
    );
    Ok(result)
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

    // Helper функции для тестов reps
    fn create_test_card_json(reviews: &[(&str, &str, f64, f64)]) -> String {
        if reviews.is_empty() {
            return r#"{"reviews": []}"#.to_string();
        }

        let review_objects: Vec<String> = reviews
            .iter()
            .map(|(date, rating, stability, difficulty)| {
                format!(
                    r#"{{"date": "{}", "rating": "{}", "stability": {}, "difficulty": {}}}"#,
                    date, rating, stability, difficulty
                )
            })
            .collect();

        format!(r#"{{"reviews": [{}]}}"#, review_objects.join(", "))
    }

    #[test]
    fn test_compute_all_fields_reps_calculation() {
        let now_iso = "2025-01-10T12:00:00Z";
        let params_json =
            r#"{"request_retention": 0.9, "maximum_interval": 365.0, "enable_fuzz": false}"#;
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        // Тест 1: пустые reviews -> reps = 0
        let empty_card = create_test_card_json(&[]);
        let result1 = compute_all_fields(
            &empty_card,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for empty card");
        assert_eq!(result1.reps, Some(0), "Empty card should have reps=0");

        // Тест 2: одна сессия "Good" -> reps = 1
        let good_card = create_test_card_json(&[("2025-01-01T10:00:00Z", "Good", 5.0, 3.0)]);
        let result2 = compute_all_fields(
            &good_card,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for card with Good review");
        assert_eq!(
            result2.reps,
            Some(1),
            "Card with one Good review should have reps=1"
        );

        // Тест 3: одна сессия "Again" -> reps = 1 (Again считается повторением)
        let again_card = create_test_card_json(&[("2025-01-01T10:00:00Z", "Again", 0.5, 8.0)]);
        let result3 = compute_all_fields(
            &again_card,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for card with Again review");
        assert_eq!(
            result3.reps,
            Some(1),
            "Card with one Again review should have reps=1"
        );

        // Тест 4: "Again" затем "Good" -> reps = 2
        let again_good_card = create_test_card_json(&[
            ("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            ("2025-01-02T10:00:00Z", "Good", 2.0, 5.0),
        ]);
        let result4 = compute_all_fields(
            &again_good_card,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for card with Again then Good");
        assert_eq!(
            result4.reps,
            Some(2),
            "Card with Again then Good should have reps=2"
        );

        // Тест 5: "Good" затем "Again" -> reps = 2 (Again считается повторением)
        let good_again_card = create_test_card_json(&[
            ("2025-01-01T10:00:00Z", "Good", 5.0, 3.0),
            ("2025-01-02T10:00:00Z", "Again", 0.8, 7.0),
        ]);
        let result5 = compute_all_fields(
            &good_again_card,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for card with Good then Again");
        assert_eq!(
            result5.reps,
            Some(2),
            "Card with Good then Again should have reps=2"
        );

        // Тест 6: "Good", "Good", "Again" -> reps = 3
        let two_good_then_again = create_test_card_json(&[
            ("2025-01-01T10:00:00Z", "Good", 5.0, 3.0),
            ("2025-01-02T10:00:00Z", "Good", 8.0, 2.5),
            ("2025-01-03T10:00:00Z", "Again", 0.8, 7.0),
        ]);
        let result6 = compute_all_fields(
            &two_good_then_again,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for card with two Good then Again");
        assert_eq!(
            result6.reps,
            Some(3),
            "Card with two Good then Again should have reps=3"
        );

        // Тест 7: "Again", "Again", "Good" -> reps = 3 (все повторения считаются)
        let two_again_then_good = create_test_card_json(&[
            ("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            ("2025-01-02T10:00:00Z", "Again", 0.3, 9.0),
            ("2025-01-03T10:00:00Z", "Good", 2.0, 5.0),
        ]);
        let result7 = compute_all_fields(
            &two_again_then_good,
            now_iso,
            params_json,
            default_stability,
            default_difficulty,
        )
        .expect("Should compute fields for card with two Again then Good");
        assert_eq!(
            result7.reps,
            Some(3),
            "Card with two Again then Good should have reps=3"
        );
    }
}
