//! Модуль валидации параметров таблицы FSRS
//! Проверяет корректность параметров, полученных из парсинга SQL-подобного синтаксиса

use log::debug;

use super::Expression;
use super::ParseError;
use crate::table_processing::types::{TableParams, is_valid_table_field};

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

/// Валидирует параметры таблицы. Возвращает `Ok(())` если всё корректно,
/// `Err(ParseError)` если есть неизвестные поля.
pub fn validate_table_params(params: &TableParams) -> Result<(), ParseError> {
    debug!("Валидация параметры таблицы: {:?}", params);

    // Проверяем, что есть хотя бы одна колонка
    if params.columns.is_empty() {
        return Err(ParseError::Syntax(
            "В SELECT должно быть указано хотя бы одно поле".to_string(),
        ));
    }

    // Проверяем поля в SELECT
    for column in &params.columns {
        let field = &column.field;

        if !is_valid_table_field(field) {
            return Err(ParseError::Syntax(format!(
                "Неизвестное поле в SELECT: '{}'",
                field
            )));
        }
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

    // Проверяем условие WHERE, если есть
    if let Some(condition) = &params.where_condition {
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

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::types::{SortDirection, SortParam, TableColumn};

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
    fn test_validate_empty_columns() {
        let params = TableParams {
            columns: vec![],
            limit: 0,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("SELECT"));
    }

    #[test]
    fn test_validate_valid_params() {
        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "file".to_string(),
                width: None,
                date_format: None,
            }],
            limit: 100,
            sort: None,
            where_condition: None,
        };

        let result = validate_table_params(&params);
        assert!(result.is_ok());
    }
}
