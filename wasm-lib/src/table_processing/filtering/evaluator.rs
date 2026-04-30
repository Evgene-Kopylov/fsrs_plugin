//! Модуль для оценки WHERE-условий в SQL-подобном синтаксисе
//! Поддерживает операторы сравнения и логические операторы AND/OR
//! Поддерживает числовые поля (reps, stability, ...) и строковые (due, state, file)

use crate::table_processing::filtering::calculator::CardWithComputedFields;
use crate::table_processing::parsing::{ComparisonOp, Expression, LogicalOp, Value};
use log;

/// Поля, сравнивающиеся как строки
const STRING_FIELDS: &[&str] = &["due", "state", "file"];

/// Ошибка оценки выражения
#[derive(Debug, Clone, PartialEq)]
pub enum EvaluationError {
    /// Неизвестное поле
    UnknownField(String),
    /// Отсутствующее значение поля в карточке
    MissingField(String),
}

impl std::fmt::Display for EvaluationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EvaluationError::UnknownField(field) => write!(f, "Неизвестное поле: {}", field),
            EvaluationError::MissingField(field) => write!(f, "Отсутствует поле: {}", field),
        }
    }
}

impl std::error::Error for EvaluationError {}

/// Оценивает выражение WHERE для заданной карточки
pub fn evaluate_condition(
    condition: &Expression,
    card: &CardWithComputedFields,
) -> Result<bool, EvaluationError> {
    log::debug!("evaluate_condition called: {:?}", condition);

    let result = match condition {
        Expression::Comparison {
            field,
            operator,
            value,
        } => evaluate_comparison(field, *operator, value, card),
        Expression::Logical {
            left,
            operator,
            right,
        } => {
            let left_result = evaluate_condition(left, card)?;
            let right_result = evaluate_condition(right, card)?;

            match operator {
                LogicalOp::And => Ok(left_result && right_result),
                LogicalOp::Or => Ok(left_result || right_result),
            }
        }
    };

    match &result {
        Ok(value) => log::debug!("evaluate_condition result: {}", value),
        Err(err) => log::warn!("evaluate_condition error: {}", err),
    }

    result
}

/// Оценивает сравнение для одного поля (числового или строкового)
fn evaluate_comparison(
    field: &str,
    operator: ComparisonOp,
    value: &Value,
    card: &CardWithComputedFields,
) -> Result<bool, EvaluationError> {
    log::debug!(
        "evaluate_comparison: field={}, operator={:?}",
        field,
        operator
    );

    if STRING_FIELDS.contains(&field) {
        return evaluate_string_comparison(field, operator, value, card);
    }

    evaluate_numeric_comparison(field, operator, value, card)
}

/// Строковое сравнение (due, state, file)
fn evaluate_string_comparison(
    field: &str,
    operator: ComparisonOp,
    value: &Value,
    card: &CardWithComputedFields,
) -> Result<bool, EvaluationError> {
    let field_value = get_string_field_value(field, card)?;

    let target_value = match value {
        Value::String(s) => s.as_str(),
        Value::Number(n) => {
            log::warn!(
                "Строковое поле {} сравнивается с числом {}, возвращаем false",
                field,
                n
            );
            return Ok(false);
        }
    };

    log::debug!(
        "string compare: field={}, value={:?}, target={:?}",
        field,
        field_value,
        target_value
    );

    let result = match operator {
        ComparisonOp::Greater => field_value.as_str() > target_value,
        ComparisonOp::Less => field_value.as_str() < target_value,
        ComparisonOp::GreaterOrEqual => field_value.as_str() >= target_value,
        ComparisonOp::LessOrEqual => field_value.as_str() <= target_value,
        ComparisonOp::Equal => field_value == target_value,
        ComparisonOp::NotEqual => field_value != target_value,
    };

    Ok(result)
}

/// Числовое сравнение (reps, stability, и т.д.)
fn evaluate_numeric_comparison(
    field: &str,
    operator: ComparisonOp,
    value: &Value,
    card: &CardWithComputedFields,
) -> Result<bool, EvaluationError> {
    let target_value = match value {
        Value::Number(n) => *n,
        Value::String(_) => {
            log::warn!(
                "Числовое поле {} сравнивается со строкой, возвращаем false",
                field
            );
            return Ok(false);
        }
    };

    let field_value = get_field_value(field, card)?;

    log::debug!(
        "numeric compare: field={}, value={}, target={}",
        field,
        field_value,
        target_value
    );

    let result = match operator {
        ComparisonOp::Greater => field_value > target_value,
        ComparisonOp::Less => field_value < target_value,
        ComparisonOp::GreaterOrEqual => field_value >= target_value,
        ComparisonOp::LessOrEqual => field_value <= target_value,
        ComparisonOp::Equal => (field_value - target_value).abs() < f64::EPSILON,
        ComparisonOp::NotEqual => (field_value - target_value).abs() >= f64::EPSILON,
    };

    Ok(result)
}

/// Получает числовое значение поля из карточки
fn get_field_value(field: &str, card: &CardWithComputedFields) -> Result<f64, EvaluationError> {
    let result = match field {
        "reps" => card
            .reps
            .ok_or_else(|| EvaluationError::MissingField("reps".to_string()))
            .map(|r| r as f64),
        "stability" => card
            .stability
            .ok_or_else(|| EvaluationError::MissingField("stability".to_string())),
        "difficulty" => card
            .difficulty
            .ok_or_else(|| EvaluationError::MissingField("difficulty".to_string())),
        "retrievability" => card
            .retrievability
            .ok_or_else(|| EvaluationError::MissingField("retrievability".to_string())),
        "elapsed" => card
            .elapsed
            .ok_or_else(|| EvaluationError::MissingField("elapsed".to_string())),
        "scheduled" => card
            .scheduled
            .ok_or_else(|| EvaluationError::MissingField("scheduled".to_string())),
        _ => Err(EvaluationError::UnknownField(field.to_string())),
    };

    result
}

/// Получает строковое значение поля из карточки
fn get_string_field_value(
    field: &str,
    card: &CardWithComputedFields,
) -> Result<String, EvaluationError> {
    let result = match field {
        "due" => card
            .due
            .clone()
            .ok_or_else(|| EvaluationError::MissingField("due".to_string())),
        "state" => card
            .state
            .clone()
            .ok_or_else(|| EvaluationError::MissingField("state".to_string())),
        "file" => card
            .file
            .clone()
            .ok_or_else(|| EvaluationError::MissingField("file".to_string())),
        _ => Err(EvaluationError::UnknownField(field.to_string())),
    };

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::parsing::{ComparisonOp, Expression, Value};

    fn create_test_card() -> CardWithComputedFields {
        CardWithComputedFields {
            file: Some("test.md".to_string()),
            reps: Some(5),
            stability: Some(0.7),
            difficulty: Some(0.3),
            retrievability: Some(0.4),
            due: Some("2024-01-01".to_string()),
            state: Some("review".to_string()),
            elapsed: Some(10.5),
            scheduled: Some(30.2),
            additional_fields: std::collections::HashMap::new(),
        }
    }

    #[test]
    fn test_evaluate_comparison_less() {
        let card = create_test_card();
        let expr = Expression::comparison("reps", ComparisonOp::Less, Value::Number(10.0));
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_evaluate_comparison_equal() {
        let card = create_test_card();
        let expr = Expression::comparison("stability", ComparisonOp::Equal, Value::Number(0.7));
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_evaluate_comparison_not_equal() {
        let card = create_test_card();
        let expr = Expression::comparison("difficulty", ComparisonOp::NotEqual, Value::Number(0.5));
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_evaluate_logical_and() {
        let card = create_test_card();
        let expr = Expression::and(
            Expression::comparison("retrievability", ComparisonOp::Greater, Value::Number(0.0)),
            Expression::comparison("reps", ComparisonOp::Less, Value::Number(10.0)),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_evaluate_logical_or() {
        let card = create_test_card();
        let expr = Expression::or(
            Expression::comparison("stability", ComparisonOp::Greater, Value::Number(1.0)),
            Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.5)),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_evaluate_complex_expression() {
        let card = create_test_card();
        let expr = Expression::and(
            Expression::comparison("reps", ComparisonOp::Greater, Value::Number(0.0)),
            Expression::or(
                Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.3)),
                Expression::comparison("stability", ComparisonOp::Greater, Value::Number(0.5)),
            ),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_evaluate_unknown_field() {
        let card = create_test_card();
        let expr =
            Expression::comparison("unknown_field", ComparisonOp::Greater, Value::Number(0.0));
        assert!(matches!(
            evaluate_condition(&expr, &card),
            Err(EvaluationError::UnknownField(_))
        ));
    }

    // Тесты строковых сравнений

    #[test]
    fn test_string_comparison_due_less() {
        let card = create_test_card();
        // due = "2024-01-01", сравниваем с "2024-06-01" — карточка должна быть раньше
        let expr = Expression::comparison(
            "due",
            ComparisonOp::Less,
            Value::string("2024-06-01".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_due_greater() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "due",
            ComparisonOp::Greater,
            Value::string("2023-01-01".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_state_equal() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "state",
            ComparisonOp::Equal,
            Value::string("review".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_state_not_equal() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "state",
            ComparisonOp::NotEqual,
            Value::string("learning".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_file_equal() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "file",
            ComparisonOp::Equal,
            Value::string("test.md".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_file_not_equal_false() {
        let card = create_test_card();
        // file = "test.md", != "test.md" ложно
        let expr = Expression::comparison(
            "file",
            ComparisonOp::NotEqual,
            Value::string("test.md".to_string()),
        );
        assert!(!evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_due_greater_or_equal() {
        let card = create_test_card();
        // due = "2024-01-01" >= "2024-01-01" истинно
        let expr = Expression::comparison(
            "due",
            ComparisonOp::GreaterOrEqual,
            Value::string("2024-01-01".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_due_less_or_equal() {
        let card = create_test_card();
        // due = "2024-01-01" <= "2023-12-31" ложно
        let expr = Expression::comparison(
            "due",
            ComparisonOp::LessOrEqual,
            Value::string("2023-12-31".to_string()),
        );
        assert!(!evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_comparison_state_less() {
        let card = create_test_card();
        // state = "review" < "reviewing" истинно (лексикографически)
        let expr = Expression::comparison(
            "state",
            ComparisonOp::Less,
            Value::string("reviewing".to_string()),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_mixed_string_and_numeric_and() {
        let card = create_test_card();
        // state = "review" AND reps > 3
        let expr = Expression::and(
            Expression::comparison(
                "state",
                ComparisonOp::Equal,
                Value::string("review".to_string()),
            ),
            Expression::comparison("reps", ComparisonOp::Greater, Value::Number(3.0)),
        );
        assert!(evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_mixed_string_and_numeric_and_false() {
        let card = create_test_card();
        // state = "review" AND reps > 10 (reps=5, не > 10)
        let expr = Expression::and(
            Expression::comparison(
                "state",
                ComparisonOp::Equal,
                Value::string("review".to_string()),
            ),
            Expression::comparison("reps", ComparisonOp::Greater, Value::Number(10.0)),
        );
        assert!(!evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_string_field_with_numeric_value_returns_false() {
        let card = create_test_card();
        // Строковое поле state с числовым значением — должно вернуть false
        let expr = Expression::comparison("state", ComparisonOp::Equal, Value::Number(5.0));
        assert!(!evaluate_condition(&expr, &card).unwrap());
    }

    #[test]
    fn test_numeric_field_with_string_value_returns_false() {
        let card = create_test_card();
        // Числовое поле reps со строковым значением — должно вернуть false
        let expr = Expression::comparison(
            "reps",
            ComparisonOp::Equal,
            Value::string("hello".to_string()),
        );
        assert!(!evaluate_condition(&expr, &card).unwrap());
    }
}
