//! Модуль валидации параметров таблицы FSRS
//! Проверяет корректность параметров, полученных из парсинга SQL-подобного синтаксиса

use log::{debug, warn};
use serde::{Deserialize, Serialize, ser::SerializeStruct};

use super::Expression;
use super::ParseError;
use crate::table_processing::types::{TableParams, is_valid_table_field};

/// Типы предупреждений, обнаруженных при валидации
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseWarning {
    /// Дублирующееся поле в SELECT
    DuplicateField(String),
    /// Некорректное значение LIMIT
    InvalidLimit(usize),
    /// Дублирующееся условие WHERE
    DuplicateWhere(String),
    /// Прочее предупреждение
    Other(String),
}

impl serde::Serialize for ParseWarning {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let (type_str, message) = match self {
            ParseWarning::DuplicateField(field) => {
                ("DuplicateField", format!("Дублирующееся поле: '{}'", field))
            }
            ParseWarning::InvalidLimit(limit) => {
                ("InvalidLimit", format!("Некорректный LIMIT: {}", limit))
            }
            ParseWarning::DuplicateWhere(field) => (
                "DuplicateWhere",
                format!("Дублирующееся условие WHERE: '{}'", field),
            ),
            ParseWarning::Other(msg) => ("Other", msg.clone()),
        };

        let mut state = serializer.serialize_struct("ParseWarning", 2)?;
        state.serialize_field("type", type_str)?;
        state.serialize_field("message", &message)?;
        state.end()
    }
}

impl<'de> serde::Deserialize<'de> for ParseWarning {
    fn deserialize<D>(_deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        // Для обратной совместимости - не используется в текущей реализации
        // так как предупреждения только отправляются в TypeScript
        Err(serde::de::Error::custom(
            "Deserialization of ParseWarning is not supported",
        ))
    }
}

impl std::fmt::Display for ParseWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseWarning::DuplicateField(field) => write!(f, "Дублирующееся поле: '{}'", field),
            ParseWarning::InvalidLimit(limit) => write!(f, "Некорректный LIMIT: {}", limit),
            ParseWarning::DuplicateWhere(field) => {
                write!(f, "Дублирующееся условие WHERE: '{}'", field)
            }
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
}

/// Рекурсивно собирает все поля из выражения WHERE
fn collect_fields_from_expression(expr: &Expression) -> Vec<String> {
    let mut fields = Vec::new();
    match expr {
        Expression::Comparison { field, .. } => {
            fields.push(field.clone());
        }
        Expression::Logical { left, right, .. } => {
            fields.extend(collect_fields_from_expression(left));
            fields.extend(collect_fields_from_expression(right));
        }
    }
    fields
}

/// Валидирует параметры таблицы, полученные из парсинга
/// Возвращает `Ok(ValidationResult)` с предупреждениями для некритичных проблем
/// (дубликаты полей, большой лимит).
/// Возвращает `Err(ParseError)` для неизвестных полей в SELECT, WHERE, ORDER BY —
/// запрос невыполним.
pub fn validate_table_params(params: &TableParams) -> Result<ValidationResult, ParseError> {
    let mut warnings = Vec::new();
    debug!("Валидация параметры таблицы: {:?}", params);

    // Проверяем поля в SELECT
    let mut seen_fields = std::collections::HashSet::new();
    for column in &params.columns {
        let field = &column.field;

        // Проверяем, является ли поле допустимым
        if !is_valid_table_field(field) {
            return Err(ParseError::Syntax(format!(
                "Неизвестное поле в SELECT: '{}'",
                field
            )));
        }

        // Проверяем дублирование полей
        if !seen_fields.insert(field.clone()) {
            warnings.push(ParseWarning::DuplicateField(field.clone()));
        }
    }

    // Проверяем, что есть хотя бы одна колонка
    if params.columns.is_empty() {
        warnings.push(ParseWarning::Other(
            "В SELECT должно быть указано хотя бы одно поле".to_string(),
        ));
    }

    // Проверяем поле сортировки, если указано
    if let Some(sort) = &params.sort
        && !is_valid_table_field(&sort.field)
    {
        return Err(ParseError::Syntax(format!(
            "Неизвестное поле в ORDER BY: '{}'",
            sort.field
        )));
    }

    // Проверяем LIMIT (больше 1000 может быть проблемой производительности)
    if params.limit > 1000 {
        warnings.push(ParseWarning::InvalidLimit(params.limit));
    }

    // Проверяем условие WHERE, если есть
    if let Some(condition) = &params.where_condition {
        // Собираем все поля из выражения WHERE
        let where_fields = collect_fields_from_expression(condition);
        for field in where_fields {
            if !is_valid_table_field(&field) {
                return Err(ParseError::Syntax(format!(
                    "Неизвестное поле в WHERE: '{}'",
                    field
                )));
            }
        }
    }

    if !warnings.is_empty() {
        warn!("Обнаружены предупреждения при валидации: {:?}", warnings);
    }

    Ok(ValidationResult::new(warnings))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::types::{SortDirection, SortParam, TableColumn};

    #[test]
    fn test_validate_duplicate_field() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "file".to_string(),
                    width: None,
                    date_format: None,
                },
                TableColumn {
                    field: "file".to_string(),
                    title: "file2".to_string(),
                    width: None,
                    date_format: None,
                },
            ],
            limit: 0,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params).unwrap();
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::DuplicateField(field) => assert_eq!(field, "file"),
            _ => panic!("Ожидалось предупреждение DuplicateField"),
        }
    }

    #[test]
    fn test_validate_unknown_field_in_select() {
        let params = TableParams {
            columns: vec![TableColumn {
                field: "unknown".to_string(),
                title: "unknown".to_string(),
                width: None,
                date_format: None,
            }],
            limit: 0,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("SELECT"));
        assert!(err.contains("unknown"));
    }

    #[test]
    fn test_validate_unknown_sort_field() {
        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "file".to_string(),
                width: None,
                date_format: None,
            }],
            limit: 0,
            sort: Some(SortParam {
                field: "unknown".to_string(),
                direction: SortDirection::Asc,
            }),
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("ORDER BY"));
        assert!(err.contains("unknown"));
    }

    #[test]
    fn test_validate_unknown_field_in_where() {
        use crate::table_processing::parsing::expression::Expression;

        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "file".to_string(),
                width: None,
                date_format: None,
            }],
            limit: 0,
            sort: None,
            where_condition: Some(Expression::comparison(
                "unknown",
                crate::table_processing::parsing::expression::ComparisonOp::Equal,
                crate::table_processing::parsing::expression::Value::Number(1.0),
            )),
        };

        let result = validate_table_params(&params);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("unknown"));
    }

    #[test]
    fn test_validate_large_limit() {
        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "file".to_string(),
                width: None,
                date_format: None,
            }],
            limit: 2000,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params).unwrap();
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

        let result = validate_table_params(&params).unwrap();
        assert_eq!(result.warnings.len(), 1);
        match &result.warnings[0] {
            ParseWarning::Other(msg) => assert!(msg.contains("SELECT")),
            _ => panic!("Ожидалось предупреждение Other"),
        }
    }

    #[test]
    fn test_parse_warning_display() {
        let warning = ParseWarning::DuplicateField("test".to_string());
        assert_eq!(warning.to_string(), "Дублирующееся поле: 'test'");

        let warning = ParseWarning::InvalidLimit(5000);
        assert_eq!(warning.to_string(), "Некорректный LIMIT: 5000");

        let warning = ParseWarning::DuplicateWhere("test".to_string());
        assert_eq!(warning.to_string(), "Дублирующееся условие WHERE: 'test'");

        let warning = ParseWarning::Other("test message".to_string());
        assert_eq!(warning.to_string(), "test message");
    }

    #[test]
    fn test_validation_result() {
        let warnings = vec![
            ParseWarning::DuplicateField("test".to_string()),
            ParseWarning::InvalidLimit(5000),
        ];
        let result = ValidationResult::new(warnings.clone());
        assert_eq!(result.warnings.len(), 2);
    }
}
