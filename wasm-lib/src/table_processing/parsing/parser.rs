//! Синтаксический анализатор для SQL-подобного синтаксиса блоков `fsrs-table`
//! Преобразует последовательность токенов в структуру TableParams

use log::{debug, info, warn};

use super::lexer::{SqlLexer, Token, TokenType};
use super::{ComparisonOp, Expression, ParseError, ParseResult, ParseWarning, Value};
use crate::table_processing::types::{
    AVAILABLE_FIELDS, SortDirection, SortParam, TableColumn, TableParams,
};

/// Промежуточная структура для хранения результата парсинга
/// перед валидацией и преобразованием в TableParams
#[derive(Debug, Default)]
struct ParsedQuery {
    /// Список колонок, указанных в SELECT
    columns: Vec<ColumnDefinition>,
    /// Условие фильтрации WHERE (опционально)
    where_condition: Option<Expression>,
    /// Параметры сортировки (опционально)
    sort: Option<SortDefinition>,
    /// Ограничение количества строк (0 = не указано)
    limit: usize,
    /// Предупреждения, обнаруженные во время парсинга
    warnings: Vec<ParseWarning>,
}

/// Определение колонки с полем и алиасом
#[derive(Debug)]
struct ColumnDefinition {
    /// Имя поля
    field: String,
    /// Алиас (заголовок) колонки (опционально)
    alias: Option<String>,
}

/// Определение сортировки
#[derive(Debug)]
struct SortDefinition {
    /// Поле для сортировки
    field: String,
    /// Направление сортировки
    direction: SortDirection,
}

/// Состояние парсера для обработки потока токенов
struct ParserState<'a> {
    /// Лексический анализатор
    lexer: &'a mut SqlLexer,
    /// Текущий токен
    current_token: Token,
    /// Результат парсинга
    result: ParsedQuery,
}

impl<'a> ParserState<'a> {
    /// Создает новое состояние парсера
    fn new(lexer: &'a mut SqlLexer) -> Result<Self, ParseError> {
        let current_token = lexer.next_token().map_err(ParseError::Lexical)?;

        Ok(Self {
            lexer,
            current_token,
            result: ParsedQuery::default(),
        })
    }

    /// Переходит к следующему токену
    fn advance(&mut self) -> Result<(), ParseError> {
        let old_token = self.current_token.clone();
        self.current_token = self.lexer.next_token().map_err(ParseError::Lexical)?;
        debug!("advance: {} -> {}", old_token, self.current_token);
        Ok(())
    }

    /// Потребляет токен определенного типа и значения
    fn consume(
        &mut self,
        expected_type: TokenType,
        expected_value: Option<&str>,
    ) -> Result<(), ParseError> {
        if self.current_token.token_type == TokenType::Eof {
            return Err(ParseError::UnexpectedEof);
        }

        if self.current_token.token_type != expected_type {
            return Err(ParseError::Syntax(format!(
                "Ожидается {:?}, получено {:?} ('{}')",
                expected_type, self.current_token.token_type, self.current_token.value
            )));
        }

        if let Some(expected) = expected_value
            && self.current_token.value != expected
        {
            return Err(ParseError::Syntax(format!(
                "Ожидается '{}', получено '{}'",
                expected, self.current_token.value
            )));
        }

        self.advance()
    }

    /// Потребляет ключевое слово
    fn consume_keyword(&mut self, keyword: &str) -> Result<(), ParseError> {
        self.consume(TokenType::Keyword, Some(keyword))
    }

    /// Парсит весь SQL-запрос
    fn parse_query(&mut self) -> Result<(), ParseError> {
        debug!("Начало парсинга SQL-запроса");

        // Парсим SELECT clause
        self.parse_select_clause()?;
        debug!(
            "parse_query: after select clause, current token = {:?}",
            self.current_token
        );

        // Парсим дополнительные части в любом порядке
        while self.current_token.token_type != TokenType::Eof {
            debug!("parse_query loop: current token = {:?}", self.current_token);
            if self.current_token.is_keyword("WHERE") {
                info!("Found WHERE keyword");
                self.parse_where_clause()?;
            } else if self.current_token.is_keyword("ORDER") {
                debug!("Found ORDER keyword");
                self.parse_order_by_clause()?;
            } else if self.current_token.is_keyword("LIMIT") {
                debug!("Found LIMIT keyword");
                self.parse_limit_clause()?;
            } else {
                // Любой неожиданный токен — это ошибка
                return Err(ParseError::Syntax(format!(
                    "Неожиданный токен: '{}' (ожидалось WHERE, ORDER BY или LIMIT)",
                    self.current_token.value
                )));
            }
        }

        debug!("Парсинг SQL-запроса завершен");
        Ok(())
    }

    /// Парсит SELECT clause
    fn parse_select_clause(&mut self) -> Result<(), ParseError> {
        self.consume_keyword("SELECT")?;

        debug!(
            "parse_select_clause: current token = {:?}",
            self.current_token
        );

        // Проверяем, является ли первая колонка звездочкой
        if self.current_token.is_operator('*') {
            debug!("Found * operator, parsing star column");
            // Обрабатываем SELECT *
            self.parse_star_column()?;
            debug!(
                "After parse_star_column: current token = {:?}",
                self.current_token
            );

            // После звездочки не должно быть других колонок
            if self.current_token.is_operator(',') {
                return Err(ParseError::Syntax(
                    "Нельзя использовать запятую после SELECT *".to_string(),
                ));
            }
        } else {
            debug!("Parsing regular column definition");
            // Парсим первую колонку
            self.parse_column_definition()?;
            debug!(
                "After first column: current token = {:?}",
                self.current_token
            );

            // Парсим остальные колонки, разделенные запятыми
            while self.current_token.is_operator(',') {
                self.advance()?; // Пропускаем запятую
                self.parse_column_definition()?;
            }
        }

        debug!(
            "parse_select_clause completed, current token = {:?}",
            self.current_token
        );
        Ok(())
    }

    /// Обрабатывает звездочку (*) для выбора всех полей
    fn parse_star_column(&mut self) -> Result<(), ParseError> {
        debug!(
            "parse_star_column: current token = {:?}",
            self.current_token
        );

        // Проверяем, что текущий токен - звездочка
        if !self.current_token.is_operator('*') {
            return Err(ParseError::Syntax(
                "Ожидается оператор '*' для выбора всех полей".to_string(),
            ));
        }

        // Пропускаем звездочку
        self.advance()?;
        debug!(
            "parse_star_column: star processed, adding all available fields, next token = {:?}",
            self.current_token
        );

        // Добавляем все доступные поля
        for &field in AVAILABLE_FIELDS.iter() {
            self.result.columns.push(ColumnDefinition {
                field: field.to_string(),
                alias: None,
            });
        }

        Ok(())
    }

    /// Парсит определение колонки: identifier [AS string]
    fn parse_column_definition(&mut self) -> Result<(), ParseError> {
        // Проверяем, является ли токен идентификатором или звездочкой
        match self.current_token.token_type {
            TokenType::Identifier => {
                let field = self.current_token.value.clone().to_lowercase();
                self.advance()?;

                let mut alias = None;

                // Проверяем наличие алиаса
                if self.current_token.is_keyword("AS") {
                    self.advance()?; // Пропускаем AS

                    if self.current_token.token_type != TokenType::String {
                        return Err(ParseError::Syntax(format!(
                            "Ожидается строка с алиасом в двойных кавычках, получено '{}'",
                            self.current_token.value
                        )));
                    }

                    alias = Some(self.current_token.value.clone());
                    self.advance()?;
                }

                self.result.columns.push(ColumnDefinition { field, alias });
                Ok(())
            }
            TokenType::Operator if self.current_token.value == "*" => {
                // Звездочка должна обрабатываться в parse_select_clause
                Err(ParseError::Syntax(
                    "Звездочка (*) должна быть единственным элементом в SELECT".to_string(),
                ))
            }
            _ => Err(ParseError::Syntax(format!(
                "Ожидается идентификатор поля, получено '{}'",
                self.current_token.value
            ))),
        }
    }

    /// Парсит WHERE clause
    fn parse_where_clause(&mut self) -> Result<(), ParseError> {
        self.consume_keyword("WHERE")?;

        // Проверяем, не было ли уже условия WHERE
        if self.result.where_condition.is_some() {
            warn!("Обнаружено дублирующееся условие WHERE");
            self.result
                .warnings
                .push(ParseWarning::DuplicateWhere("WHERE".to_string()));
        }

        let condition = self.parse_expression()?;
        info!("parse_where_clause: parsed condition = {:?}", condition);
        self.result.where_condition = Some(condition);
        Ok(())
    }

    /// Парсит ORDER BY clause
    fn parse_order_by_clause(&mut self) -> Result<(), ParseError> {
        self.consume_keyword("ORDER")?;
        self.consume_keyword("BY")?;

        if self.current_token.token_type != TokenType::Identifier {
            return Err(ParseError::Syntax(format!(
                "Ожидается поле для сортировки, получено '{}'",
                self.current_token.value
            )));
        }

        let field = self.current_token.value.clone().to_lowercase();
        self.advance()?;

        // Определяем направление сортировки (по умолчанию ASC)
        let direction = if self.current_token.is_keyword("ASC") {
            self.advance()?;
            SortDirection::Asc
        } else if self.current_token.is_keyword("DESC") {
            self.advance()?;
            SortDirection::Desc
        } else {
            SortDirection::Asc
        };

        self.result.sort = Some(SortDefinition { field, direction });

        Ok(())
    }

    /// Парсит LIMIT clause
    fn parse_limit_clause(&mut self) -> Result<(), ParseError> {
        self.consume_keyword("LIMIT")?;

        if self.current_token.token_type != TokenType::Number {
            return Err(ParseError::Syntax(format!(
                "Ожидается число для LIMIT, получено '{}'",
                self.current_token.value
            )));
        }

        let limit_str = self.current_token.value.clone();
        self.advance()?;

        match limit_str.parse::<usize>() {
            Ok(limit) if limit > 0 => {
                self.result.limit = limit;
                Ok(())
            }
            Ok(0) => {
                warn!("LIMIT 0 не имеет смысла, будет проигнорирован");
                self.result.warnings.push(ParseWarning::InvalidLimit(0));
                Ok(())
            }
            Ok(_) => {
                warn!("Отрицательный LIMIT, будет проигнорирован");
                self.result
                    .warnings
                    .push(ParseWarning::InvalidLimit(limit_str.parse().unwrap_or(0)));
                Ok(())
            }
            Err(_) => Err(ParseError::Syntax(format!(
                "Некорректное число для LIMIT: '{}'",
                limit_str
            ))),
        }
    }

    /// Парсит выражение WHERE
    fn parse_expression(&mut self) -> Result<Expression, ParseError> {
        // Начинаем с parse_or_expr
        self.parse_or_expr()
    }

    /// Парсит выражение OR (низший приоритет)
    fn parse_or_expr(&mut self) -> Result<Expression, ParseError> {
        let mut expr = self.parse_and_expr()?;

        while self.current_token.is_keyword("OR") {
            self.advance()?; // Пропускаем OR
            let right = self.parse_and_expr()?;
            expr = Expression::or(expr, right);
        }

        Ok(expr)
    }

    /// Парсит выражение AND (средний приоритет)
    fn parse_and_expr(&mut self) -> Result<Expression, ParseError> {
        let mut expr = self.parse_comparison()?;

        while self.current_token.is_keyword("AND") {
            self.advance()?; // Пропускаем AND
            let right = self.parse_comparison()?;
            expr = Expression::and(expr, right);
        }

        Ok(expr)
    }

    /// Парсит сравнение: field operator value
    fn parse_comparison(&mut self) -> Result<Expression, ParseError> {
        // Поле
        if self.current_token.token_type != TokenType::Identifier {
            return Err(ParseError::Syntax(format!(
                "Ожидается имя поля, получено '{}'",
                self.current_token.value
            )));
        }
        let field = self.current_token.value.clone().to_lowercase();
        self.advance()?;

        // Оператор
        let operator = self.parse_comparison_operator()?;

        // Значение
        let value = self.parse_value()?;

        Ok(Expression::comparison(&field, operator, value))
    }

    /// Парсит оператор сравнения
    fn parse_comparison_operator(&mut self) -> Result<ComparisonOp, ParseError> {
        let op_str = self.current_token.value.clone();
        let operator = match op_str.as_str() {
            ">" => ComparisonOp::Greater,
            "<" => ComparisonOp::Less,
            ">=" => ComparisonOp::GreaterOrEqual,
            "<=" => ComparisonOp::LessOrEqual,
            "=" => ComparisonOp::Equal,
            "!=" => ComparisonOp::NotEqual,
            _ => {
                return Err(ParseError::Syntax(format!(
                    "Неподдерживаемый оператор сравнения: '{}'",
                    op_str
                )));
            }
        };
        self.advance()?;
        Ok(operator)
    }

    /// Парсит значение (число)
    fn parse_value(&mut self) -> Result<Value, ParseError> {
        if self.current_token.token_type != TokenType::Number {
            return Err(ParseError::Syntax(format!(
                "Ожидается числовое значение, получено '{}'",
                self.current_token.value
            )));
        }

        let num_str = self.current_token.value.clone();
        let number = num_str
            .parse::<f64>()
            .map_err(|_| ParseError::Syntax(format!("Некорректное число: '{}'", num_str)))?;

        self.advance()?;
        Ok(Value::number(number))
    }

    /// Преобразует результат парсинга в TableParams
    fn into_table_params(self) -> ParseResult<TableParams> {
        let mut columns = Vec::new();

        // Преобразуем ColumnDefinition в TableColumn
        for col_def in self.result.columns {
            let title = col_def.alias.unwrap_or(col_def.field.clone());

            columns.push(TableColumn {
                field: col_def.field,
                title,
                width: None,
            });
        }

        // Преобразуем SortDefinition в SortParam
        let sort = self.result.sort.map(|sort_def| SortParam {
            field: sort_def.field,
            direction: sort_def.direction,
        });

        let params = TableParams {
            columns,
            limit: self.result.limit,
            sort,
            where_condition: self.result.where_condition,
        };

        ParseResult::new(params, self.result.warnings)
    }
}

/// Парсит SQL-подобный синтаксис и возвращает результат с TableParams
///
/// # Аргументы
/// * `source` - исходный текст SQL-подобного запроса
///
/// # Возвращает
/// Результат парсинга с параметрами таблицы и предупреждениями
pub fn parse_sql_block(source: &str) -> Result<ParseResult<TableParams>, ParseError> {
    let mut lexer = SqlLexer::new(source);
    let mut parser_state = ParserState::new(&mut lexer)?;

    match parser_state.parse_query() {
        Ok(_) => Ok(parser_state.into_table_params()),
        Err(err) => {
            // Даже при ошибке можем вернуть частичный результат с предупреждениями
            warn!(
                "Ошибка парсинга SQL: {}, возвращаем значения по умолчанию",
                err
            );
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::parsing::LogicalOp;

    #[test]
    fn test_parse_simple_select() {
        let result = parse_sql_block("SELECT file, reps, overdue").unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 3);
        assert_eq!(params.columns[0].field, "file");
        assert_eq!(params.columns[0].title, "file");
        assert_eq!(params.columns[1].field, "reps");
        assert_eq!(params.columns[1].title, "reps");
        assert_eq!(params.columns[2].field, "overdue");
        assert_eq!(params.columns[2].title, "overdue");
        assert_eq!(params.limit, 0);
        assert!(params.sort.is_none());
    }

    #[test]
    fn test_parse_select_with_aliases() {
        let result = parse_sql_block(r#"SELECT file as "Файл", reps as "Повторений""#).unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 2);
        assert_eq!(params.columns[0].field, "file");
        assert_eq!(params.columns[0].title, "Файл");
        assert_eq!(params.columns[1].field, "reps");
        assert_eq!(params.columns[1].title, "Повторений");
    }

    #[test]
    fn test_parse_mixed_aliases() {
        let result =
            parse_sql_block(r#"SELECT file as "Имя файла", reps, overdue as "Задержка""#).unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 3);
        assert_eq!(params.columns[0].field, "file");
        assert_eq!(params.columns[0].title, "Имя файла");
        assert_eq!(params.columns[1].field, "reps");
        assert_eq!(params.columns[1].title, "reps"); // заголовок по умолчанию
        assert_eq!(params.columns[2].field, "overdue");
        assert_eq!(params.columns[2].title, "Задержка");
    }

    #[test]
    fn test_parse_with_order_by() {
        let result = parse_sql_block("SELECT file, reps ORDER BY due DESC").unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 2);
        assert!(params.sort.is_some());
        let sort = params.sort.unwrap();
        assert_eq!(sort.field, "due");
        assert_eq!(sort.direction, SortDirection::Desc);
    }

    #[test]
    fn test_parse_with_order_by_asc() {
        let result = parse_sql_block("SELECT file, reps ORDER BY due ASC").unwrap();
        let params = result.value;

        let sort = params.sort.unwrap();
        assert_eq!(sort.direction, SortDirection::Asc);
    }

    #[test]
    fn test_parse_with_order_by_default() {
        let result = parse_sql_block("SELECT file, reps ORDER BY due").unwrap();
        let params = result.value;

        let sort = params.sort.unwrap();
        assert_eq!(sort.direction, SortDirection::Asc); // по умолчанию ASC
    }

    #[test]
    fn test_parse_with_limit() {
        let result = parse_sql_block("SELECT file, reps LIMIT 20").unwrap();
        let params = result.value;

        assert_eq!(params.limit, 20);
    }

    #[test]
    fn test_parse_full_query() {
        let result =
            parse_sql_block(r#"SELECT file as "Файл", reps ORDER BY due DESC LIMIT 10"#).unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 2);
        assert_eq!(params.columns[0].title, "Файл");
        assert_eq!(params.columns[1].title, "reps");

        let sort = params.sort.unwrap();
        assert_eq!(sort.field, "due");
        assert_eq!(sort.direction, SortDirection::Desc);

        assert_eq!(params.limit, 10);
    }

    #[test]
    fn test_parse_query_different_order() {
        // Порядок частей может быть другим
        let result = parse_sql_block("SELECT file LIMIT 5 ORDER BY reps DESC").unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 1);
        assert_eq!(params.limit, 5);

        let sort = params.sort.unwrap();
        assert_eq!(sort.field, "reps");
        assert_eq!(sort.direction, SortDirection::Desc);
    }

    #[test]
    fn test_parse_error_no_select() {
        let result = parse_sql_block("ORDER BY due");
        assert!(result.is_err());

        if let Err(ParseError::Syntax(msg)) = result {
            assert!(msg.contains("SELECT"));
        } else {
            panic!("Ожидалась ошибка Syntax");
        }
    }

    #[test]
    fn test_parse_error_invalid_limit() {
        let result = parse_sql_block("SELECT file LIMIT abc");
        assert!(result.is_err());

        if let Err(ParseError::Syntax(msg)) = result {
            assert!(msg.contains("LIMIT") || msg.contains("число"));
        } else {
            panic!("Ожидалась ошибка Syntax");
        }
    }

    #[test]
    fn test_parse_error_unexpected_eof() {
        let result = parse_sql_block("SELECT");
        assert!(result.is_err());

        if let Err(ParseError::Syntax(msg)) = result {
            assert!(msg.contains("идентификатор") || msg.contains("поля"));
        } else {
            panic!("Ожидалась ошибка Syntax");
        }
    }

    #[test]
    fn test_parse_warning_unexpected_token() {
        let result = parse_sql_block("SELECT file @ reps");
        // Должен вернуть результат с предупреждением или ошибку
        // из-за неожиданного символа '@'
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_empty_input() {
        let result = parse_sql_block("");
        assert!(result.is_err()); // Пустой ввод - ошибка

        if let Err(ParseError::UnexpectedEof) = result {
            // Ожидаем UnexpectedEof для пустого ввода
        } else {
            panic!("Ожидалась ошибка UnexpectedEof");
        }
    }

    #[test]
    fn test_parse_whitespace() {
        let result =
            parse_sql_block("  SELECT  file  ,  reps  ORDER  BY  due  DESC  LIMIT  10  ").unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 2);
        assert_eq!(params.limit, 10);

        let sort = params.sort.unwrap();
        assert_eq!(sort.field, "due");
        assert_eq!(sort.direction, SortDirection::Desc);
    }

    #[test]
    fn test_parse_case_insensitive_keywords() {
        // Ключевые слова должны быть регистронезависимыми
        let result = parse_sql_block("select file order by due desc limit 5").unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 1);
        assert_eq!(params.limit, 5);

        let sort = params.sort.unwrap();
        assert_eq!(sort.direction, SortDirection::Desc);
    }

    #[test]
    fn test_parse_where_simple() {
        let result = parse_sql_block("SELECT file WHERE overdue > 0").unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 1);
        assert!(params.where_condition.is_some());

        let condition = params.where_condition.unwrap();
        assert!(condition.is_comparison());
        assert_eq!(condition.get_comparison_field(), Some("overdue"));
        assert_eq!(
            condition.get_comparison_operator(),
            Some(ComparisonOp::Greater)
        );
    }

    #[test]
    fn test_parse_where_and() {
        let result = parse_sql_block("SELECT file WHERE overdue > 0 AND reps < 10").unwrap();
        let params = result.value;

        assert!(params.where_condition.is_some());
        let condition = params.where_condition.unwrap();
        assert!(condition.is_logical());

        // Проверяем структуру AND
        if let Expression::Logical {
            left,
            operator,
            right,
        } = condition
        {
            assert_eq!(operator, LogicalOp::And);
            assert!(left.is_comparison());
            assert!(right.is_comparison());
        } else {
            panic!("Expected logical expression");
        }
    }

    #[test]
    fn test_parse_where_or() {
        let result =
            parse_sql_block("SELECT file WHERE overdue > 24 OR retrievability < 0.2").unwrap();
        let params = result.value;

        assert!(params.where_condition.is_some());
        let condition = params.where_condition.unwrap();
        assert!(condition.is_logical());

        if let Expression::Logical {
            left,
            operator,
            right,
        } = condition
        {
            assert_eq!(operator, LogicalOp::Or);
            assert!(left.is_comparison());
            assert!(right.is_comparison());
        } else {
            panic!("Expected logical expression");
        }
    }

    #[test]
    fn test_parse_where_complex_priority() {
        // Проверяем приоритет AND перед OR
        let result =
            parse_sql_block("SELECT file WHERE overdue > 0 AND reps < 10 OR retrievability < 0.3")
                .unwrap();
        let params = result.value;

        assert!(params.where_condition.is_some());
        let condition = params.where_condition.unwrap();

        // Должно быть: ((overdue > 0 AND reps < 10) OR retrievability < 0.3)
        if let Expression::Logical {
            left,
            operator,
            right,
        } = condition
        {
            assert_eq!(operator, LogicalOp::Or);
            // Левая часть должна быть AND
            assert!(left.is_logical());
            // Правая часть - простое сравнение
            assert!(right.is_comparison());
        } else {
            panic!("Expected logical expression with OR at top level");
        }
    }

    #[test]
    fn test_parse_where_with_order_and_limit() {
        // Комбинация WHERE, ORDER BY и LIMIT
        let result =
            parse_sql_block("SELECT file, reps WHERE overdue > 0 ORDER BY due DESC LIMIT 10")
                .unwrap();
        let params = result.value;

        assert_eq!(params.columns.len(), 2);
        assert!(params.where_condition.is_some());
        assert!(params.sort.is_some());
        assert_eq!(params.limit, 10);

        let sort = params.sort.unwrap();
        assert_eq!(sort.field, "due");
        assert_eq!(sort.direction, SortDirection::Desc);
    }

    #[test]
    fn test_parse_where_error_unknown_field() {
        let result = parse_sql_block("SELECT file WHERE unknown_field > 0");
        // Пока не должно быть ошибки парсинга, но будет предупреждение при валидации
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_where_error_invalid_operator() {
        let result = parse_sql_block("SELECT file WHERE overdue @ 0");
        // Должна быть ошибка синтаксиса из-за неверного оператора
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_where_error_missing_value() {
        let result = parse_sql_block("SELECT file WHERE overdue >");
        // Должна быть ошибка синтаксиса из-за отсутствия значения
        assert!(result.is_err());
    }
}

#[test]
fn test_parse_where_after_limit() {
    // WHERE после LIMIT (порядок не должен иметь значения)
    let result = parse_sql_block(
        "SELECT file as \"Файл\", overdue as \"oDue\", reps LIMIT 10 WHERE overdue < 0",
    )
    .unwrap();
    let params = result.value;

    // Проверяем колонки
    assert_eq!(params.columns.len(), 3);
    assert_eq!(params.columns[0].field, "file");
    assert_eq!(params.columns[0].title, "Файл");
    assert_eq!(params.columns[1].field, "overdue");
    assert_eq!(params.columns[1].title, "oDue");
    assert_eq!(params.columns[2].field, "reps");

    // Проверяем LIMIT
    assert_eq!(params.limit, 10);

    // Проверяем WHERE условие
    assert!(params.where_condition.is_some());
    let condition = params.where_condition.unwrap();

    // Убедимся, что это сравнение
    match condition {
        Expression::Comparison {
            field,
            operator,
            value,
        } => {
            assert_eq!(field, "overdue");
            assert_eq!(operator, ComparisonOp::Less);
            match value {
                Value::Number(n) => assert_eq!(n, 0.0),
            }
        }
        _ => panic!("Expected comparison expression"),
    }
}
