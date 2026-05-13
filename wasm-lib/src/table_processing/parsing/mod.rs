//! Модуль парсинга SQL-подобного синтаксиса для блоков `fsrs-table`
//! Поддерживает синтаксис: SELECT, ORDER BY, LIMIT, псевдонимы через AS

// Подмодули
mod expression;
mod lexer;
mod parser;
mod validator;

// Реэкспорт публичных типов и функций
pub use expression::{ComparisonOp, Expression, LogicalOp, Value};
pub use parser::parse_sql_block;
pub use validator::validate_table_params;

use std::fmt;

/// Ошибка парсинга SQL-подобного синтаксиса
#[derive(Debug, Clone)]
pub enum ParseError {
    /// Лексическая ошибка (некорректный токен)
    Lexical(String),
    /// Синтаксическая ошибка (нарушение грамматики)
    Syntax(String),
    /// Неожиданный конец входных данных
    UnexpectedEof,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::Lexical(msg) => write!(f, "Лексическая ошибка: {}", msg),
            ParseError::Syntax(msg) => write!(f, "Синтаксическая ошибка: {}", msg),
            ParseError::UnexpectedEof => write!(f, "Неожиданный конец входных данных"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Результат парсинга с возможными предупреждениями
#[derive(Debug, Clone)]
pub struct ParseResult<T> {
    /// Результат парсинга
    pub value: T,
    /// Предупреждения, обнаруженные во время парсинга
    pub warnings: Vec<String>,
}

impl<T> ParseResult<T> {
    /// Создает новый результат парсинга
    pub fn new(value: T, warnings: Vec<String>) -> Self {
        Self { value, warnings }
    }
}

/// Основная функция парсинга блока fsrs-table
///
/// # Аргументы
/// * `source` - исходный текст блока fsrs-table
///
/// # Возвращает
/// Результат парсинга с параметрами таблицы и предупреждениями
///
/// # Пример
/// ```
/// use table_processing::parsing::parse_fsrs_table_block;
///
/// let result = parse_fsrs_table_block("SELECT file, reps ORDER BY due DESC LIMIT 10");
/// match result {
///     Ok(parse_result) => {
///         let params = parse_result.value;
///         // Обработка предупреждений
///         for warning in parse_result.warnings {
///             log::warn!("{}", warning);
///         }
///     }
///     Err(err) => {
///         log::error!("Ошибка парсинга: {}", err);
///     }
/// }
/// ```
pub fn parse_fsrs_table_block(
    source: &str,
) -> Result<ParseResult<crate::table_processing::types::TableParams>, ParseError> {
    use log::{debug, info};

    debug!("Начало парсинга fsrs-table блока: {}", source);

    if source.trim().is_empty() {
        info!("Пустой блок fsrs-table, возвращаем ошибку");
        return Err(ParseError::Syntax("Пустой блок fsrs-table".to_string()));
    }

    // Парсинг SQL-подобного синтаксиса
    let parse_result = parse_sql_block(source)?;

    // Валидация параметров таблицы
    validate_table_params(&parse_result.value)?;

    debug!("Парсинг завершен успешно");
    Ok(ParseResult::new(parse_result.value, parse_result.warnings))
}
