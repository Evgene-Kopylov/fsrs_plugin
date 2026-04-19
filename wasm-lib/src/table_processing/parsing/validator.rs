//! Модуль валидации параметров таблицы FSRS
//! Проверяет корректность параметров, полученных из парсинга SQL-подобного синтаксиса

use log::{debug, warn};
use serde::{Deserialize, Serialize};

use crate::table_processing::types::{TableParams, is_valid_table_field};
use super::Expression;

/// Типы предупреждений, обнаруженных при валидации
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ParseWarning {
    /// Неизвестное поле в SELECT
    UnknownField(String),
    /// Дублирующееся поле в SELECT
    DuplicateField(String),
    /// Некорректное значение LIMIT
    InvalidLimit(usize),
    /// Неизвестное поле для сортировки
    UnknownSortField(String),
    /// Неожиданный токен (для восстановления после ошибок)
    UnexpectedToken(String),
    /// Дублирующееся условие WHERE (в текущей версии поддерживается только одно)
    DuplicateWhere(String),
    /// Прочие предупреждения
    Other(String),
}

impl std::fmt::Display for ParseWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseWarning::UnknownField(field) => write!(f, "Неизвестное поле: '{}'", field),
            ParseWarning::DuplicateField(field) => write!(f, "Дублирующееся поле: '{}'", field),
            ParseWarning::InvalidLimit(limit) => write!(f, "Некорректный LIMIT: {}", limit),
            ParseWarning::UnknownSortField(field) => write!(f, "Неизвестное поле для сортировки: '{}'", field),
            ParseWarning::UnexpectedToken(token) => write!(f, "Неожиданный токен: '{}'", token),
            ParseWarning::DuplicateWhere(field) => write!(f, "Дублирующееся условие WHERE: '{}'", field),
            ParseWarning::Other(msg) => write!(f, "{}", msg),
        }
    }
}

/// Результат валидации с предупреждениями
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Предупреждения, обнаруженные во время валидации
    pub warnings: Vec<ParseWarning>,
}

impl ValidationResult {
    /// Создает новый результат валидации
    pub fn new(warnings: Vec<ParseWarning>) -> Self {
        Self { warnings }
    }

    /// Создает пустой результат валидации
    pub fn empty() -> Self {
        Self { warnings: Vec::new() }
    }
}

/// Валидирует параметры таблицы, полученные из парсинга
/// Возвращает предупреждения, но не ошибки (потому что парсер уже проверил синтаксис)
pub fn validate_table_params(params: &TableParams) -> ValidationResult {
    let mut warnings = Vec::new();
    debug!("Валидация параметров таблицы: {:?}", params);

    // Проверяем поля в SELECT
    let mut seen_fields = std::collections::HashSet::new();
    for column in &params.columns {
        let field = &column.field;

        // Проверяем, является ли поле допустимым
        if !is_valid_table_field(field) {
            warnings.push(ParseWarning::UnknownField(field.clone()));
        }

        // Проверяем дублирование полей
        if !seen_fields.insert(field.clone()) {
            warnings.push(ParseWarning::DuplicateField(field.clone()));
        }
    }

    // Проверяем, что есть хотя бы одна колонка
    if params.columns.is_empty() {
        warnings.push(ParseWarning::Other("В SELECT должно быть указано хотя бы одно поле".to_string()));
    }

    // Проверяем поле сортировки, если указано
    if let Some(sort) = &params.sort {
        if !is_valid_table_field(&sort.field) {
            warnings.push(ParseWarning::UnknownSortField(sort.field.clone()));
        }
    }

    // Проверяем LIMIT (больше 1000 может быть проблемой производительности)
    if params.limit > 1000 {
        warnings.push(ParseWarning::InvalidLimit(params.limit));
    }

    // Проверяем условие WHERE, если есть
    if let Some(condition) = &params.where_condition {
        // В текущей версии только базовые проверки
        // Более сложная проверка выполняется в evaluator
        debug!("Условие WHERE: {:?}", condition);
    }

    if !warnings.is_empty() {
        warn!("Обнаружены предупреждения при валидации: {:?}", warnings);
    }

    ValidationResult::new(warnings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::types::{TableColumn, SortParam, SortDirection};

    #[test]
    fn test_validate_duplicate_field() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "file".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "file".to_string(),
                    title: "file2".to_string(),
                    width: None,
                },
            ],
            limit: 0,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::DuplicateField(field) => assert_eq!(field, "file"),
            _ => panic!("Ожидалось предупреждение DuplicateField"),
        }
    }

    #[test]
    fn test_validate_unknown_field() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "unknown".to_string(),
                    title: "unknown".to_string(),
                    width: None,
                },
            ],
            limit: 0,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::UnknownField(field) => assert_eq!(field, "unknown"),
            _ => panic!("Ожидалось предупреждение UnknownField"),
        }
    }

    #[test]
    fn test_validate_unknown_sort_field() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "file".to_string(),
                    width: None,
                },
            ],
            limit: 0,
            sort: Some(SortParam {
                field: "unknown".to_string(),
                direction: SortDirection::Asc,
            }),
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::UnknownSortField(field) => assert_eq!(field, "unknown"),
            _ => panic!("Ожидалось предупреждение UnknownSortField"),
        }
    }

    #[test]
    fn test_validate_large_limit() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "file".to_string(),
                    width: None,
                },
            ],
            limit: 2000,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::InvalidLimit(limit) => assert_eq!(*limit, 2000),
            _ => panic!("Ожидалось предупреждение InvalidLimit"),
        }
    }

    #[test]
    fn test_validate_empty_columns() {
        let params = TableParams {
            columns: vec![],
            limit: 0,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::Other(msg) => assert!(msg.contains("SELECT")),
            _ => panic!("Ожидалось предупреждение Other"),
        }
    }

    #[test]
    fn test_parse_warning_display() {
        let warning = ParseWarning::UnknownField("test".to_string());
        assert_eq!(warning.to_string(), "Неизвестное поле: 'test'");

        let warning = ParseWarning::DuplicateField("test".to_string());
        assert_eq!(warning.to_string(), "Дублирующееся поле: 'test'");

        let warning = ParseWarning::InvalidLimit(5000);
        assert_eq!(warning.to_string(), "Некорректный LIMIT: 5000");

        let warning = ParseWarning::UnknownSortField("test".to_string());
        assert_eq!(warning.to_string(), "Неизвестное поле для сортировки: 'test'");

        let warning = ParseWarning::UnexpectedToken("@".to_string());
        assert_eq!(warning.to_string(), "Неожиданный токен: '@'");

        let warning = ParseWarning::DuplicateWhere("test".to_string());
        assert_eq!(warning.to_string(), "Дублирующееся условие WHERE: 'test'");

        let warning = ParseWarning::Other("test message".to_string());
        assert_eq!(warning.to_string(), "test message");
    }

    #[test]
    fn test_validation_result() {
        let warnings = vec![
            ParseWarning::UnknownField("test".to_string()),
            ParseWarning::DuplicateField("test2".to_string()),
        ];
        let result = ValidationResult::new(warnings.clone());
        assert_eq!(result.warnings.len(), 2);

        let empty = ValidationResult::empty();
        assert!(empty.warnings.is_empty());
    }
}
