//! Модуль для оценки WHERE-условий в SQL-подобном синтаксисе
//! Поддерживает операторы сравнения и логические операторы AND/OR


use crate::table_processing::parsing::{Expression, ComparisonOp, LogicalOp, Value};
use crate::table_processing::filtering::calculator::CardWithComputedFields;

/// Ошибка оценки выражения
#[derive(Debug, Clone, PartialEq)]
pub enum EvaluationError {
    /// Неизвестное поле
    UnknownField(String),
    /// Неподдерживаемый оператор для данного типа поля
    UnsupportedOperator(String, String),
    /// Отсутствующее значение поля в карточке
    MissingField(String),
    /// Ошибка вычисления значения поля
    CalculationError(String),
}

impl std::fmt::Display for EvaluationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EvaluationError::UnknownField(field) => write!(f, "Неизвестное поле: {}", field),
            EvaluationError::UnsupportedOperator(field, op) => {
                write!(f, "Неподдерживаемый оператор {} для поля {}", op, field)
            }
            EvaluationError::MissingField(field) => write!(f, "Отсутствует поле: {}", field),
            EvaluationError::CalculationError(msg) => write!(f, "Ошибка вычисления: {}", msg),
        }
    }
}

impl std::error::Error for EvaluationError {}

/// Оценивает выражение WHERE для заданной карточки
pub fn evaluate_condition(condition: &Expression, card: &CardWithComputedFields) -> Result<bool, EvaluationError> {
    match condition {
        Expression::Comparison { field, operator, value } => {
            evaluate_comparison(field, *operator, value, card)
        }
        Expression::Logical { left, operator, right } => {
            let left_result = evaluate_condition(left, card)?;
            let right_result = evaluate_condition(right, card)?;

            match operator {
                LogicalOp::And => Ok(left_result && right_result),
                LogicalOp::Or => Ok(left_result || right_result),
            }
        }
    }
}

/// Оценивает сравнение для одного поля
fn evaluate_comparison(
    field: &str,
    operator: ComparisonOp,
    value: &Value,
    card: &CardWithComputedFields
) -> Result<bool, EvaluationError> {
    // Извлекаем числовое значение из Value (для Фазы 1 всегда число)
    let target_value = match value {
        Value::Number(n) => *n,
    };

    // Получаем значение поля из карточки
    let field_value = get_field_value(field, card)?;

    // Применяем оператор сравнения
    match operator {
        ComparisonOp::Greater => Ok(field_value > target_value),
        ComparisonOp::Less => Ok(field_value < target_value),
        ComparisonOp::GreaterOrEqual => Ok(field_value >= target_value),
        ComparisonOp::LessOrEqual => Ok(field_value <= target_value),
        ComparisonOp::Equal => Ok((field_value - target_value).abs() < f64::EPSILON),
        ComparisonOp::NotEqual => Ok((field_value - target_value).abs() >= f64::EPSILON),
    }
}

/// Получает числовое значение поля из карточки
fn get_field_value(field: &str, card: &CardWithComputedFields) -> Result<f64, EvaluationError> {
    match field {
        "overdue" => card.overdue.ok_or_else(|| EvaluationError::MissingField("overdue".to_string())),
        "reps" => {
            // reps хранится как Option<u32>, преобразуем в f64
            card.reps
                .ok_or_else(|| EvaluationError::MissingField("reps".to_string()))
                .map(|r| r as f64)
        }
        "stability" => card.stability.ok_or_else(|| EvaluationError::MissingField("stability".to_string())),
        "difficulty" => card.difficulty.ok_or_else(|| EvaluationError::MissingField("difficulty".to_string())),
        "retrievability" => card.retrievability.ok_or_else(|| EvaluationError::MissingField("retrievability".to_string())),
        "elapsed" => card.elapsed.ok_or_else(|| EvaluationError::MissingField("elapsed".to_string())),
        "scheduled" => card.scheduled.ok_or_else(|| EvaluationError::MissingField("scheduled".to_string())),
        _ => Err(EvaluationError::UnknownField(field.to_string())),
    }
}

/// Проверяет, является ли поле числовым и поддерживается ли оно
pub fn is_field_supported(field: &str) -> bool {
    matches!(
        field,
        "overdue" | "reps" | "stability" | "difficulty" | "retrievability" | "elapsed" | "scheduled"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::parsing::{Expression, Value, ComparisonOp};

    fn create_test_card() -> CardWithComputedFields {
        CardWithComputedFields {
            file: Some("test.md".to_string()),
            reps: Some(5),
            overdue: Some(24.5),
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
    fn test_evaluate_comparison_greater() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "overdue",
            ComparisonOp::Greater,
            Value::Number(20.0),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 24.5 > 20.0
    }

    #[test]
    fn test_evaluate_comparison_less() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "reps",
            ComparisonOp::Less,
            Value::Number(10.0),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 5 < 10
    }

    #[test]
    fn test_evaluate_comparison_equal() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "stability",
            ComparisonOp::Equal,
            Value::Number(0.7),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 0.7 == 0.7
    }

    #[test]
    fn test_evaluate_comparison_not_equal() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "difficulty",
            ComparisonOp::NotEqual,
            Value::Number(0.5),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // 0.3 != 0.5
    }

    #[test]
    fn test_evaluate_logical_and() {
        let card = create_test_card();
        let expr = Expression::and(
            Expression::comparison("overdue", ComparisonOp::Greater, Value::Number(20.0)),
            Expression::comparison("reps", ComparisonOp::Less, Value::Number(10.0)),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // overdue > 20 AND reps < 10
    }

    #[test]
    fn test_evaluate_logical_or() {
        let card = create_test_card();
        let expr = Expression::or(
            Expression::comparison("overdue", ComparisonOp::Greater, Value::Number(30.0)),
            Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.5)),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // overdue > 30 OR retrievability < 0.5 (второе истинно)
    }

    #[test]
    fn test_evaluate_complex_expression() {
        let card = create_test_card();
        let expr = Expression::and(
            Expression::comparison("overdue", ComparisonOp::Greater, Value::Number(0.0)),
            Expression::or(
                Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.3)),
                Expression::comparison("stability", ComparisonOp::Greater, Value::Number(0.5)),
            ),
        );

        let result = evaluate_condition(&expr, &card).unwrap();
        assert!(result); // overdue > 0 AND (retrievability < 0.3 OR stability > 0.5)
    }

    #[test]
    fn test_evaluate_unknown_field() {
        let card = create_test_card();
        let expr = Expression::comparison(
            "unknown_field",
            ComparisonOp::Greater,
            Value::Number(0.0),
        );

        let result = evaluate_condition(&expr, &card);
        assert!(matches!(result, Err(EvaluationError::UnknownField(_))));
    }

    #[test]
    fn test_evaluate_missing_field() {
        let mut card = create_test_card();
        card.overdue = None; // Удаляем значение

        let expr = Expression::comparison(
            "overdue",
            ComparisonOp::Greater,
            Value::Number(0.0),
        );

        let result = evaluate_condition(&expr, &card);
        assert!(matches!(result, Err(EvaluationError::MissingField(_))));
    }

    #[test]
    fn test_is_field_supported() {
        assert!(is_field_supported("overdue"));
        assert!(is_field_supported("reps"));
        assert!(is_field_supported("stability"));
        assert!(is_field_supported("difficulty"));
        assert!(is_field_supported("retrievability"));
        assert!(is_field_supported("elapsed"));
        assert!(is_field_supported("scheduled"));
        assert!(!is_field_supported("file")); // не числовое поле
        assert!(!is_field_supported("unknown"));
    }
}
