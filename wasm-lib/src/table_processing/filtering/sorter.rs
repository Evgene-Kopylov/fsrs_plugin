//! Модуль сортировки карточек для таблицы FSRS
//! Включает алгоритмы сортировки по разным полям с поддержкой различных типов данных

use serde::{Deserialize, Serialize};
use log::{debug, warn};

/// Ошибки фильтрации
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FilterError {
    /// Ошибка парсинга JSON
    JsonParseError(String),
    /// Отсутствует поле для сортировки
    MissingSortField(String),
    /// Некорректный тип данных для сортировки
    InvalidDataType(String),
    /// Ошибка сортировки
    SortFailed(String),
    /// Функция не реализована
    NotImplemented,
}

/// Ошибки сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortError {
    /// Некорректное поле для сортировки
    InvalidField(String),
    /// Некорректное направление сортировки
    InvalidDirection,
    /// Ошибка сравнения значений
    ComparisonError(String),
    /// Функция не реализована
    NotImplemented,
}

impl std::fmt::Display for FilterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FilterError::JsonParseError(msg) => write!(f, "Ошибка парсинга JSON: {}", msg),
            FilterError::MissingSortField(field) => write!(f, "Отсутствует поле для сортировки: {}", field),
            FilterError::InvalidDataType(msg) => write!(f, "Некорректный тип данных: {}", msg),
            FilterError::SortFailed(msg) => write!(f, "Ошибка сортировки: {}", msg),
            FilterError::NotImplemented => write!(f, "Функция не реализована"),
        }
    }
}

impl std::fmt::Display for SortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SortError::InvalidField(field) => write!(f, "Некорректное поле для сортировки: {}", field),
            SortError::InvalidDirection => write!(f, "Некорректное направление сортировки"),
            SortError::ComparisonError(msg) => write!(f, "Ошибка сравнения значений: {}", msg),
            SortError::NotImplemented => write!(f, "Функция не реализована"),
        }
    }
}

impl std::error::Error for FilterError {}
impl std::error::Error for SortError {}

/// Направление сортировки
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum SortOrder {
    /// По возрастанию
    Ascending,
    /// По убыванию
    Descending,
}

/// Опции сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortOptions {
    /// Поле для сортировки
    pub field: String,
    /// Направление сортировки
    pub order: SortOrder,
    /// Использовать стабильную сортировку (сохранять порядок при равных значениях)
    pub stable: bool,
}

impl Default for SortOptions {
    fn default() -> Self {
        Self {
            field: "due".to_string(),
            order: SortOrder::Ascending,
            stable: true,
        }
    }
}

/// Значение для сравнения при сортировке
#[derive(Debug, Clone, PartialEq)]
enum SortValue {
    /// Строковое значение
    String(String),
    /// Числовое значение с плавающей точкой
    Number(f64),
    /// Целочисленное значение
    Integer(i64),
    /// Булево значение
    Boolean(bool),
    /// Отсутствующее значение (сортируется в конце)
    Null,
}

impl SortValue {
    /// Сравнивает два значения для сортировки
    fn compare(&self, other: &Self, order: SortOrder) -> std::cmp::Ordering {
        use std::cmp::Ordering;

        let cmp = match (self, other) {
            (SortValue::String(a), SortValue::String(b)) => a.cmp(b),
            (SortValue::Number(a), SortValue::Number(b)) => {
                if a < b {
                    Ordering::Less
                } else if a > b {
                    Ordering::Greater
                } else {
                    Ordering::Equal
                }
            }
            (SortValue::Integer(a), SortValue::Integer(b)) => a.cmp(b),
            (SortValue::Boolean(a), SortValue::Boolean(b)) => a.cmp(b),
            (SortValue::Null, SortValue::Null) => Ordering::Equal,
            (SortValue::Null, _) => Ordering::Greater, // Null в конец
            (_, SortValue::Null) => Ordering::Less,    // Null в конец

            // Разные типы: сортируем по типу
            _ => {
                let type_order = |v: &SortValue| match v {
                    SortValue::String(_) => 0,
                    SortValue::Number(_) => 1,
                    SortValue::Integer(_) => 2,
                    SortValue::Boolean(_) => 3,
                    SortValue::Null => 4,
                };
                type_order(self).cmp(&type_order(other))
            }
        };

        // Применяем направление сортировки
        match order {
            SortOrder::Ascending => cmp,
            SortOrder::Descending => cmp.reverse(),
        }
    }
}

/// Извлекает значение для сортировки из JSON карточки
///
/// # TODO
/// Реализовать фактическое извлечение с учетом типов полей
fn extract_sort_value(card_json: &str, field: &str) -> Result<SortValue, SortError> {
    debug!("Извлечение значения для сортировки по полю '{}'", field);

    // TODO: Реализовать фактическое извлечение значения из JSON
    // Временная заглушка
    Ok(SortValue::Null)
}

/// Сортирует карточки по заданному полю и направлению
///
/// # Аргументы
/// * `cards_json` - JSON массив карточек
/// * `field` - поле для сортировки
/// * `order` - направление сортировки
///
/// # Возвращает
/// Отсортированный JSON массив карточек или ошибку сортировки
///
/// # TODO
/// Реализовать фактическую сортировку с учетом типов данных
pub fn sort_cards_by_field(
    cards_json: &str,
    field: &str,
    order: SortOrder,
) -> Result<String, SortError> {
    debug!("Сортировка карточек по полю '{}'", field);

    // Проверка валидности поля
    if field.is_empty() {
        return Err(SortError::InvalidField("Пустое имя поля".to_string()));
    }

    // TODO: Реализовать фактическую сортировку
    // Временная заглушка: возвращаем исходные данные
    warn!("Функция sort_cards_by_field не реализована, возвращаем исходные данные");
    Ok(cards_json.to_string())
}

/// Сортирует карточки с использованием расширенных опций
///
/// # Аргументы
/// * `cards_json` - JSON массив карточек
/// * `options` - опции сортировки
///
/// # Возвращает
/// Отсортированный JSON массив карточек или ошибку сортировки
///
/// # TODO
/// Реализовать фактическую сортировку
pub fn sort_cards_with_options(
    cards_json: &str,
    options: &SortOptions,
) -> Result<String, SortError> {
    sort_cards_by_field(cards_json, &options.field, options.order)
}

/// Применяет лимит к отсортированным карточкам
///
/// # Аргументы
/// * `cards_json` - JSON массив карточек
/// * `limit` - максимальное количество карточек (0 = без ограничения)
///
/// # Возвращает
/// JSON массив карточек с примененным лимитом или ошибку
///
/// # TODO
/// Реализовать фактическое применение лимита
pub fn apply_limit(cards_json: &str, limit: usize) -> Result<String, FilterError> {
    debug!("Применение лимита: {}", limit);

    if limit == 0 {
        // Без ограничения
        return Ok(cards_json.to_string());
    }

    // TODO: Реализовать фактическое применение лимита
    // Временная заглушка: возвращаем исходные данные
    warn!("Функция apply_limit не реализована, возвращаем исходные данные");
    Ok(cards_json.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_error_display() {
        let errors = vec![
            FilterError::JsonParseError("invalid".to_string()),
            FilterError::MissingSortField("due".to_string()),
            FilterError::InvalidDataType("string".to_string()),
            FilterError::SortFailed("failed".to_string()),
            FilterError::NotImplemented,
        ];

        let displays: Vec<String> = errors.iter().map(|e| e.to_string()).collect();

        assert!(displays[0].contains("Ошибка парсинга JSON"));
        assert!(displays[1].contains("Отсутствует поле для сортировки"));
        assert!(displays[2].contains("Некорректный тип данных"));
        assert!(displays[3].contains("Ошибка сортировки"));
        assert!(displays[4].contains("Функция не реализована"));
    }

    #[test]
    fn test_sort_error_display() {
        let errors = vec![
            SortError::InvalidField("invalid".to_string()),
            SortError::InvalidDirection,
            SortError::ComparisonError("error".to_string()),
            SortError::NotImplemented,
        ];

        let displays: Vec<String> = errors.iter().map(|e| e.to_string()).collect();

        assert!(displays[0].contains("Некорректное поле для сортировки"));
        assert!(displays[1].contains("Некорректное направление сортировки"));
        assert!(displays[2].contains("Ошибка сравнения значений"));
        assert!(displays[3].contains("Функция не реализована"));
    }

    #[test]
    fn test_sort_options_default() {
        let options = SortOptions::default();

        assert_eq!(options.field, "due");
        assert!(matches!(options.order, SortOrder::Ascending));
        assert!(options.stable);
    }

    #[test]
    fn test_sort_value_compare_strings() {
        let a = SortValue::String("apple".to_string());
        let b = SortValue::String("banana".to_string());

        assert_eq!(a.compare(&b, SortOrder::Ascending), std::cmp::Ordering::Less);
        assert_eq!(b.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Greater);
        assert_eq!(a.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Equal);

        // Проверка обратного порядка
        assert_eq!(a.compare(&b, SortOrder::Descending), std::cmp::Ordering::Greater);
        assert_eq!(b.compare(&a, SortOrder::Descending), std::cmp::Ordering::Less);
    }

    #[test]
    fn test_sort_value_compare_numbers() {
        let a = SortValue::Number(1.5);
        let b = SortValue::Number(2.5);

        assert_eq!(a.compare(&b, SortOrder::Ascending), std::cmp::Ordering::Less);
        assert_eq!(b.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Greater);
        assert_eq!(a.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Equal);
    }

    #[test]
    fn test_sort_value_compare_integers() {
        let a = SortValue::Integer(1);
        let b = SortValue::Integer(2);

        assert_eq!(a.compare(&b, SortOrder::Ascending), std::cmp::Ordering::Less);
        assert_eq!(b.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Greater);
    }

    #[test]
    fn test_sort_value_compare_booleans() {
        let a = SortValue::Boolean(false);
        let b = SortValue::Boolean(true);

        assert_eq!(a.compare(&b, SortOrder::Ascending), std::cmp::Ordering::Less);
        assert_eq!(b.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Greater);
    }

    #[test]
    fn test_sort_value_compare_null() {
        let a = SortValue::Null;
        let b = SortValue::String("value".to_string());

        // Null всегда в конце при сортировке по возрастанию
        assert_eq!(a.compare(&b, SortOrder::Ascending), std::cmp::Ordering::Greater);
        assert_eq!(b.compare(&a, SortOrder::Ascending), std::cmp::Ordering::Less);

        // При сортировке по убывании Null в начале
        assert_eq!(a.compare(&b, SortOrder::Descending), std::cmp::Ordering::Less);
        assert_eq!(b.compare(&a, SortOrder::Descending), std::cmp::Ordering::Greater);
    }

    #[test]
    fn test_sort_value_compare_different_types() {
        let values = vec![
            SortValue::String("string".to_string()),
            SortValue::Number(1.5),
            SortValue::Integer(2),
            SortValue::Boolean(true),
            SortValue::Null,
        ];

        // Проверяем порядок типов: String -> Number -> Integer -> Boolean -> Null
        for i in 0..values.len() {
            for j in 0..values.len() {
                let expected = i.cmp(&j);
                assert_eq!(values[i].compare(&values[j], SortOrder::Ascending), expected);
            }
        }
    }

    #[test]
    fn test_sort_cards_by_field_stub() {
        let cards_json = r#"[{"file": "test.md"}]"#;

        let result = sort_cards_by_field(cards_json, "due", SortOrder::Ascending);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), cards_json);
    }

    #[test]
    fn test_sort_cards_by_field_empty_field() {
        let cards_json = r#"[{"file": "test.md"}]"#;

        let result = sort_cards_by_field(cards_json, "", SortOrder::Ascending);
        assert!(result.is_err());

        if let Err(SortError::InvalidField(msg)) = result {
            assert!(msg.contains("Пустое имя поля"));
        } else {
            panic!("Expected InvalidField error");
        }
    }

    #[test]
    fn test_sort_cards_with_options_stub() {
        let cards_json = r#"[{"file": "test.md"}]"#;
        let options = SortOptions::default();

        let result = sort_cards_with_options(cards_json, &options);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), cards_json);
    }

    #[test]
    fn test_apply_limit_zero() {
        let cards_json = r#"[{"file": "test.md"}]"#;

        let result = apply_limit(cards_json, 0);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), cards_json);
    }

    #[test]
    fn test_apply_limit_positive() {
        let cards_json = r#"[{"file": "test.md"}]"#;

        let result = apply_limit(cards_json, 5);
        assert!(result.is_ok());
        // Заглушка возвращает исходные данные
        assert_eq!(result.unwrap(), cards_json);
    }
}
