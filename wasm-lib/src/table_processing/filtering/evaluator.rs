//! Модуль для оценки WHERE-условий в SQL-подобном синтаксисе
//! Поддерживает операторы сравнения и логические операторы AND/OR

use crate::table_processing::filtering::calculator::CardWithComputedFields;
use crate::table_processing::parsing::{ComparisonOp, Expression, LogicalOp, Value};
use log;

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

/// Оценивает сравнение для одного поля
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

    // Извлекаем числовое значение из Value (для Фазы 1 всегда число)
    let target_value = match value {
        Value::Number(n) => *n,
    };

    log::debug!("target_value: {}", target_value);

    // Получаем значение поля из карточки
    let field_value = get_field_value(field, card)?;

    log::debug!("field_value: {}", field_value);

    // Применяем оператор сравнения
    let result = match operator {
        ComparisonOp::Greater => field_value > target_value,
        ComparisonOp::Less => field_value < target_value,
        ComparisonOp::GreaterOrEqual => field_value >= target_value,
        ComparisonOp::LessOrEqual => field_value <= target_value,
        ComparisonOp::Equal => (field_value - target_value).abs() < f64::EPSILON,
        ComparisonOp::NotEqual => (field_value - target_value).abs() >= f64::EPSILON,
    };

    log::debug!(
        "comparison result: {} {} {} = {}",
        field_value,
        operator,
        target_value,
        result
    );

    Ok(result)
}

/// Получает числовое значение поля из карточки
fn get_field_value(field: &str, card: &CardWithComputedFields) -> Result<f64, EvaluationError> {
    log::debug!("get_field_value: field={}", field);

    let result = match field {
        "reps" => {
            // reps хранится как Option<u32>, преобразуем в f64
            log::debug!("reps value: {:?}", card.reps);
            card.reps
                .ok_or_else(|| EvaluationError::MissingField("reps".to_string()))
                .map(|r| r as f64)
        }
        "stability" => {
            log::debug!("stability value: {:?}", card.stability);
            card.stability
                .ok_or_else(|| EvaluationError::MissingField("stability".to_string()))
        }
        "difficulty" => {
            log::debug!("difficulty value: {:?}", card.difficulty);
            card.difficulty
                .ok_or_else(|| EvaluationError::MissingField("difficulty".to_string()))
        }
        "retrievability" => {
            log::debug!("retrievability value: {:?}", card.retrievability);
            card.retrievability
                .ok_or_else(|| EvaluationError::MissingField("retrievability".to_string()))
        }
        "elapsed" => {
            log::debug!("elapsed value: {:?}", card.elapsed);
            card.elapsed
                .ok_or_else(|| EvaluationError::MissingField("elapsed".to_string()))
        }
        "scheduled" => {
            log::debug!("scheduled value: {:?}", card.scheduled);
            card.scheduled
                .ok_or_else(|| EvaluationError::MissingField("scheduled".to_string()))
        }
        _ => {
            log::warn!("Unknown field: {}", field);
            Err(EvaluationError::UnknownField(field.to_string()))
        }
    };

    match &result {
        Ok(value) => log::debug!("get_field_value result: {} = {}", field, value),
        Err(err) => log::debug!("get_field_value error: {}", err),
    }

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

    #[test]
    fn test_evaluate_comparison_less() {
        let card = create_test_card();
        let expr = Expression::comparison("reps", ComparisonOp::Less, Value::Number(10.0));

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 5 < 10
    }

    #[test]
    fn test_evaluate_comparison_equal() {
        let card = create_test_card();
        let expr = Expression::comparison("stability", ComparisonOp::Equal, Value::Number(0.7));

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 0.7 == 0.7
    }

    #[test]
    fn test_evaluate_comparison_not_equal() {
        let card = create_test_card();
        let expr = Expression::comparison("difficulty", ComparisonOp::NotEqual, Value::Number(0.5));

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 0.3 != 0.5
    }

    #[test]
    fn test_evaluate_logical_and() {
        let card = create_test_card();
        let expr = Expression::and(
            Expression::comparison("retrievability", ComparisonOp::Greater, Value::Number(0.0)),
            Expression::comparison("reps", ComparisonOp::Less, Value::Number(10.0)),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // retrievability > 0 AND reps < 10
    }

    #[test]
    fn test_evaluate_logical_or() {
        let card = create_test_card();
        let expr = Expression::or(
            Expression::comparison("stability", ComparisonOp::Greater, Value::Number(1.0)),
            Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.5)),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // stability > 1 OR retrievability < 0.5 (второе истинно)
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

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // reps > 0 AND (retrievability < 0.3 OR stability > 0.5)
    }

    #[test]
    fn test_evaluate_unknown_field() {
        let card = create_test_card();
        let expr =
            Expression::comparison("unknown_field", ComparisonOp::Greater, Value::Number(0.0));

        let result = evaluate_condition(&expr, &card);
        assert!(matches!(result, Err(EvaluationError::UnknownField(_))));
    }

}
