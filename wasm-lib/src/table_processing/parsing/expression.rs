//! AST (Abstract Syntax Tree) для выражений WHERE в SQL-подобном синтаксисе
//! Поддерживает простые сравнения и логические операторы AND/OR

use serde::{Deserialize, Serialize};
use std::fmt;

/// Оператор сравнения для условий WHERE
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComparisonOp {
    /// Больше (>)
    #[serde(rename = ">")]
    Greater,
    /// Меньше (<)
    #[serde(rename = "<")]
    Less,
    /// Больше или равно (>=)
    #[serde(rename = ">=")]
    GreaterOrEqual,
    /// Меньше или равно (<=)
    #[serde(rename = "<=")]
    LessOrEqual,
    /// Равно (=)
    #[serde(rename = "=")]
    Equal,
    /// Не равно (!=)
    #[serde(rename = "!=")]
    NotEqual,
    /// Соответствует regex (~)
    #[serde(rename = "~")]
    Regex,
    /// Не соответствует regex (!~)
    #[serde(rename = "!~")]
    NotRegex,
}

impl fmt::Display for ComparisonOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ComparisonOp::Greater => write!(f, ">"),
            ComparisonOp::Less => write!(f, "<"),
            ComparisonOp::GreaterOrEqual => write!(f, ">="),
            ComparisonOp::LessOrEqual => write!(f, "<="),
            ComparisonOp::Equal => write!(f, "="),
            ComparisonOp::NotEqual => write!(f, "!="),
            ComparisonOp::Regex => write!(f, "~"),
            ComparisonOp::NotRegex => write!(f, "!~"),
        }
    }
}

/// Логический оператор для составных условий
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogicalOp {
    /// Логическое И (AND)
    #[serde(rename = "AND")]
    And,
    /// Логическое ИЛИ (OR)
    #[serde(rename = "OR")]
    Or,
}

impl fmt::Display for LogicalOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LogicalOp::And => write!(f, "AND"),
            LogicalOp::Or => write!(f, "OR"),
        }
    }
}

/// Значение в выражении WHERE (только числа для Фазы 1)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Value {
    /// Числовое значение (целое или с плавающей точкой)
    #[serde(rename = "number")]
    Number(f64),
    /// Строковое значение (для полей due, state, file)
    #[serde(rename = "string")]
    String(String),
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Number(n) => write!(f, "{}", n),
            Value::String(s) => write!(f, "\"{}\"", s),
        }
    }
}

impl Value {
    /// Создает числовое значение
    pub fn number(value: f64) -> Self {
        Value::Number(value)
    }

    /// Создает строковое значение
    #[allow(dead_code)]
    pub fn string(value: String) -> Self {
        Value::String(value)
    }

    /// Получает числовое значение, если оно есть (только для тестов)
    #[cfg(test)]
    pub fn as_number(&self) -> Option<f64> {
        match self {
            Value::Number(n) => Some(*n),
            Value::String(_) => None,
        }
    }
}

/// Абстрактное синтаксическое дерево (AST) для выражений WHERE
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Expression {
    /// Простое сравнение: поле оператор значение
    Comparison {
        /// Имя поля для сравнения (reps, stability и т.д.)
        field: String,
        /// Оператор сравнения
        operator: ComparisonOp,
        /// Значение для сравнения
        value: Value,
    },
    /// Логическое выражение: выражение оператор выражение
    Logical {
        /// Левое выражение
        left: Box<Expression>,
        /// Логический оператор
        operator: LogicalOp,
        /// Правое выражение
        right: Box<Expression>,
    },
}

impl fmt::Display for Expression {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Expression::Comparison {
                field,
                operator,
                value,
            } => write!(f, "{} {} {}", field, operator, value),
            Expression::Logical {
                left,
                operator,
                right,
            } => write!(f, "({} {} {})", left, operator, right),
        }
    }
}

impl Expression {
    /// Создает выражение сравнения
    pub fn comparison(field: &str, operator: ComparisonOp, value: Value) -> Self {
        Expression::Comparison {
            field: field.to_string(),
            operator,
            value,
        }
    }

    /// Создает логическое выражение AND
    pub fn and(left: Expression, right: Expression) -> Self {
        Expression::Logical {
            left: Box::new(left),
            operator: LogicalOp::And,
            right: Box::new(right),
        }
    }

    /// Создает логическое выражение OR
    pub fn or(left: Expression, right: Expression) -> Self {
        Expression::Logical {
            left: Box::new(left),
            operator: LogicalOp::Or,
            right: Box::new(right),
        }
    }

    /// Проверяет, является ли выражение простым сравнением (только для тестов)
    #[cfg(test)]
    pub fn is_comparison(&self) -> bool {
        matches!(self, Expression::Comparison { .. })
    }

    /// Проверяет, является ли выражение логическим (только для тестов)
    #[cfg(test)]
    pub fn is_logical(&self) -> bool {
        matches!(self, Expression::Logical { .. })
    }

    /// Получает поле из выражения сравнения, если оно есть (только для тестов)
    #[cfg(test)]
    pub fn get_comparison_field(&self) -> Option<&str> {
        match self {
            Expression::Comparison { field, .. } => Some(field),
            _ => None,
        }
    }

    /// Получает оператор из выражения сравнения, если оно есть (только для тестов)
    #[cfg(test)]
    pub fn get_comparison_operator(&self) -> Option<ComparisonOp> {
        match self {
            Expression::Comparison { operator, .. } => Some(*operator),
            _ => None,
        }
    }

    /// Получает значение из выражения сравнения, если оно есть (только для тестов)
    #[cfg(test)]
    pub fn get_comparison_value(&self) -> Option<&Value> {
        match self {
            Expression::Comparison { value, .. } => Some(value),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_comparison_op_display() {
        assert_eq!(ComparisonOp::Greater.to_string(), ">");
        assert_eq!(ComparisonOp::Less.to_string(), "<");
        assert_eq!(ComparisonOp::GreaterOrEqual.to_string(), ">=");
        assert_eq!(ComparisonOp::LessOrEqual.to_string(), "<=");
        assert_eq!(ComparisonOp::Equal.to_string(), "=");
        assert_eq!(ComparisonOp::NotEqual.to_string(), "!=");
    }

    #[test]
    fn test_logical_op_display() {
        assert_eq!(LogicalOp::And.to_string(), "AND");
        assert_eq!(LogicalOp::Or.to_string(), "OR");
    }

    #[test]
    fn test_value_display() {
        assert_eq!(Value::Number(3.14).to_string(), "3.14");
    }

    #[test]
    fn test_value_methods() {
        let num = Value::Number(42.0);
        assert_eq!(num.as_number(), Some(42.0));
    }

    #[test]
    fn test_expression_comparison() {
        let expr = Expression::comparison("reps", ComparisonOp::Greater, Value::Number(0.0));

        assert!(expr.is_comparison());
        assert_eq!(expr.get_comparison_field(), Some("reps"));
        assert_eq!(expr.get_comparison_operator(), Some(ComparisonOp::Greater));
        assert_eq!(expr.get_comparison_value(), Some(&Value::Number(0.0)));
        assert_eq!(expr.to_string(), "reps > 0");
    }

    #[test]
    fn test_expression_logical() {
        let left = Expression::comparison("reps", ComparisonOp::Greater, Value::Number(0.0));
        let right = Expression::comparison("reps", ComparisonOp::Less, Value::Number(10.0));
        let expr = Expression::and(left.clone(), right.clone());

        assert!(expr.is_logical());
        assert_eq!(expr.to_string(), "(reps > 0 AND reps < 10)");
    }

    #[test]
    fn test_expression_or() {
        let left = Expression::comparison("reps", ComparisonOp::Greater, Value::Number(24.0));
        let right =
            Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.2));
        let expr = Expression::or(left, right);

        assert_eq!(expr.to_string(), "(reps > 24 OR retrievability < 0.2)");
    }

    #[test]
    fn test_expression_serialization() {
        let expr = Expression::comparison("reps", ComparisonOp::Greater, Value::Number(24.5));

        let json = serde_json::to_string(&expr).unwrap();
        let parsed: Expression = serde_json::from_str(&json).unwrap();

        assert_eq!(expr, parsed);
        assert!(json.contains("reps"));
        assert!(json.contains(">"));
        assert!(json.contains("24.5"));
    }

    #[test]
    fn test_complex_expression_serialization() {
        let expr = Expression::and(
            Expression::comparison("reps", ComparisonOp::Greater, Value::Number(0.0)),
            Expression::or(
                Expression::comparison("retrievability", ComparisonOp::Less, Value::Number(0.3)),
                Expression::comparison("stability", ComparisonOp::Greater, Value::Number(0.5)),
            ),
        );

        let json = serde_json::to_string(&expr).unwrap();
        let parsed: Expression = serde_json::from_str(&json).unwrap();

        assert_eq!(expr, parsed);
        assert!(json.contains("AND"));
        assert!(json.contains("OR"));
    }
}
