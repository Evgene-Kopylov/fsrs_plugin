//! Лексический анализатор для SQL-подобного синтаксиса блоков `fsrs-table`
//! Разбивает входную строку на токены: ключевые слова, идентификаторы, числа, строки, операторы

use std::fmt;
use log::debug;

/// Типы токенов
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenType {
    /// Ключевое слово (SELECT, ORDER, BY, ASC, DESC, LIMIT, AS)
    Keyword,
    /// Идентификатор (имя поля или другая последовательность букв/цифр/_)
    Identifier,
    /// Целое число (для LIMIT)
    Number,
    /// Строка в двойных кавычках (для алиасов)
    String,
    /// Оператор (запятая)
    Operator,
    /// Конец файла (входных данных)
    Eof,
}

impl fmt::Display for TokenType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TokenType::Keyword => write!(f, "KEYWORD"),
            TokenType::Identifier => write!(f, "IDENTIFIER"),
            TokenType::Number => write!(f, "NUMBER"),
            TokenType::String => write!(f, "STRING"),
            TokenType::Operator => write!(f, "OPERATOR"),
            TokenType::Eof => write!(f, "EOF"),
        }
    }
}

/// Токен с типом, значением и позицией в исходном тексте
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    /// Тип токена
    pub token_type: TokenType,
    /// Значение токена
    pub value: String,
    /// Начальная позиция в исходном тексте (символы)
    pub start: usize,
    /// Конечная позиция в исходном тексте (символы)
    pub end: usize,
}

impl fmt::Display for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}('{}') @ {}-{}", self.token_type, self.value, self.start, self.end)
    }
}

impl Token {
    /// Создает новый токен
    pub fn new(token_type: TokenType, value: String, start: usize, end: usize) -> Self {
        Self {
            token_type,
            value,
            start,
            end,
        }
    }

    /// Проверяет, является ли токен ключевым словом с заданным значением
    pub fn is_keyword(&self, keyword: &str) -> bool {
        self.token_type == TokenType::Keyword && self.value == keyword.to_uppercase()
    }

    /// Проверяет, является ли токен оператором с заданным значением
    pub fn is_operator(&self, op: char) -> bool {
        self.token_type == TokenType::Operator && self.value == op.to_string()
    }
}

/// Лексический анализатор для SQL-подобного синтаксиса
pub struct SqlLexer {
    /// Исходный текст как вектор символов для безопасного доступа
    chars: Vec<char>,
    /// Текущая позиция в символах
    position: usize,
    /// Длина исходного текста в символах
    length: usize,
}

impl SqlLexer {
    /// Создает новый лексер для заданного входного текста
    pub fn new(input: &str) -> Self {
        // Заменяем переносы строк на пробелы для упрощения парсинга
        let normalized_input = input.replace(['\r', '\n'], " ").to_string();
        let chars: Vec<char> = normalized_input.chars().collect();
        let length = chars.len();

        debug!("Создание лексера для строки (длина {}): '{}'", length, normalized_input);

        Self {
            chars,
            position: 0,
            length,
        }
    }

    /// Получает следующий токен из входного текста
    pub fn next_token(&mut self) -> Result<Token, String> {
        self.skip_whitespace();

        if self.position >= self.length {
            return Ok(Token::new(TokenType::Eof, "".to_string(), self.position, self.position));
        }

        let start = self.position;
        let current_char = self.chars[start];

        // Обработка разных типов токенов
        let token = if Self::is_letter(current_char) {
            self.read_keyword_or_identifier(start)?
        } else if Self::is_digit(current_char) {
            self.read_number(start)?
        } else if current_char == '"' {
            self.read_string(start)?
        } else if Self::is_operator_char(current_char) {
            self.read_operator(start)?
        } else {
            return Err(format!("Нераспознанный символ '{}' в позиции {}", current_char, start));
        };

        Ok(token)
    }



    /// Пропускает пробельные символы
    fn skip_whitespace(&mut self) {
        while self.position < self.length && self.chars[self.position].is_whitespace() {
            self.position += 1;
        }
    }

    /// Читает ключевое слово или идентификатор
    fn read_keyword_or_identifier(&mut self, start: usize) -> Result<Token, String> {
        let mut value = String::new();

        while self.position < self.length {
            let current_char = self.chars[self.position];
            if Self::is_identifier_char(current_char) {
                value.push(current_char);
                self.position += 1;
            } else {
                break;
            }
        }

        let end = self.position;

        // Проверяем, является ли это ключевым словом
        let upper_value = value.to_uppercase();
        let keywords = ["SELECT", "ORDER", "BY", "ASC", "DESC", "LIMIT", "AS", "WHERE", "AND", "OR"];

        let token_type = if keywords.contains(&upper_value.as_str()) {
            TokenType::Keyword
        } else {
            TokenType::Identifier
        };

        let token_value = if token_type == TokenType::Keyword {
            upper_value
        } else {
            value
        };

        Ok(Token::new(token_type, token_value, start, end))
    }

    /// Читает число (целое или с плавающей точкой)
    fn read_number(&mut self, start: usize) -> Result<Token, String> {
        let mut value = String::new();
        let mut has_decimal_point = false;

        while self.position < self.length {
            let current_char = self.chars[self.position];

            if Self::is_digit(current_char) {
                value.push(current_char);
                self.position += 1;
            } else if current_char == '.' && !has_decimal_point {
                // Разрешаем только одну десятичную точку
                value.push(current_char);
                self.position += 1;
                has_decimal_point = true;
            } else {
                break;
            }
        }

        // Проверяем, что число не заканчивается точкой
        if value.ends_with('.') {
            // Возвращаем точку в поток
            self.position -= 1;
            value.pop();
        }

        // Проверяем, что число не пустое (например, только точка)
        if value.is_empty() {
            return Err("Пустое число".to_string());
        }

        let end = self.position;
        Ok(Token::new(TokenType::Number, value, start, end))
    }

    /// Читает строку в двойных кавычках
    fn read_string(&mut self, start: usize) -> Result<Token, String> {
        // Пропускаем открывающую кавычку
        self.position += 1;
        let mut value = String::new();

        while self.position < self.length {
            let current_char = self.chars[self.position];
            if current_char == '"' {
                // Закрывающая кавычка - заканчиваем чтение строки
                self.position += 1;
                let end = self.position;
                return Ok(Token::new(TokenType::String, value, start, end));
            } else if current_char == '\\' && self.position + 1 < self.length {
                // Обработка экранированных символов
                self.position += 1;
                let escaped_char = self.chars[self.position];
                value.push(escaped_char);
                self.position += 1;
            } else {
                value.push(current_char);
                self.position += 1;
            }
        }

        // Если достигли конца строки без закрывающей кавычки
        Err("Незакрытая строка в двойных кавычках".to_string())
    }

    /// Читает оператор
    fn read_operator(&mut self, start: usize) -> Result<Token, String> {
        let current_char = self.chars[self.position];
        let mut value = current_char.to_string();
        self.position += 1;

        // Проверяем двухсимвольные операторы
        if self.position < self.length {
            let next_char = self.chars[self.position];
            let two_char_op = format!("{}{}", current_char, next_char);
            if two_char_op == ">=" || two_char_op == "<=" || two_char_op == "!=" {
                value = two_char_op;
                self.position += 1;
            }
        }

        let end = self.position;
        Ok(Token::new(TokenType::Operator, value, start, end))
    }

    /// Проверяет, является ли символ буквой
    fn is_letter(ch: char) -> bool {
        ch.is_ascii_alphabetic()
    }

    /// Проверяет, является ли символ цифрой
    fn is_digit(ch: char) -> bool {
        ch.is_ascii_digit()
    }

    /// Проверяет, является ли символ допустимым для идентификатора
    fn is_identifier_char(ch: char) -> bool {
        ch.is_ascii_alphanumeric() || ch == '_'
    }

    /// Проверяет, является ли символ оператором
    fn is_operator_char(ch: char) -> bool {
        matches!(ch, '>' | '<' | '=' | '!' | ',')
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_type_display() {
        assert_eq!(TokenType::Keyword.to_string(), "KEYWORD");
        assert_eq!(TokenType::Identifier.to_string(), "IDENTIFIER");
        assert_eq!(TokenType::Number.to_string(), "NUMBER");
        assert_eq!(TokenType::String.to_string(), "STRING");
        assert_eq!(TokenType::Operator.to_string(), "OPERATOR");
        assert_eq!(TokenType::Eof.to_string(), "EOF");
    }

    #[test]
    fn test_token_display() {
        let token = Token::new(TokenType::Keyword, "SELECT".to_string(), 0, 6);
        assert_eq!(token.to_string(), "KEYWORD('SELECT') @ 0-6");
    }

    #[test]
    fn test_token_is_keyword() {
        let token = Token::new(TokenType::Keyword, "SELECT".to_string(), 0, 6);
        assert!(token.is_keyword("SELECT"));
        assert!(!token.is_keyword("ORDER"));

        let non_keyword = Token::new(TokenType::Identifier, "file".to_string(), 0, 4);
        assert!(!non_keyword.is_keyword("file"));
    }

    #[test]
    fn test_token_is_operator() {
        let token = Token::new(TokenType::Operator, ",".to_string(), 0, 1);
        assert!(token.is_operator(','));
        assert!(!token.is_operator('.'));
    }

    #[test]
    fn test_lexer_keywords() {
        let mut lexer = SqlLexer::new("SELECT ORDER BY ASC DESC LIMIT AS");

        let tokens = vec![
            ("SELECT", TokenType::Keyword),
            ("ORDER", TokenType::Keyword),
            ("BY", TokenType::Keyword),
            ("ASC", TokenType::Keyword),
            ("DESC", TokenType::Keyword),
            ("LIMIT", TokenType::Keyword),
            ("AS", TokenType::Keyword),
        ];

        for (expected_value, expected_type) in tokens {
            let token = lexer.next_token().unwrap();
            assert_eq!(token.value, expected_value);
            assert_eq!(token.token_type, expected_type);
        }

        let eof = lexer.next_token().unwrap();
        assert_eq!(eof.token_type, TokenType::Eof);
    }

    #[test]
    fn test_lexer_identifiers() {
        let mut lexer = SqlLexer::new("file reps overdue stability");

        let tokens = vec![
            ("file", TokenType::Identifier),
            ("reps", TokenType::Identifier),
            ("overdue", TokenType::Identifier),
            ("stability", TokenType::Identifier),
        ];

        for (expected_value, expected_type) in tokens {
            let token = lexer.next_token().unwrap();
            assert_eq!(token.value, expected_value);
            assert_eq!(token.token_type, expected_type);
        }
    }

    #[test]
    fn test_lexer_numbers() {
        let mut lexer = SqlLexer::new("10 20 100");

        let tokens = vec![
            ("10", TokenType::Number),
            ("20", TokenType::Number),
            ("100", TokenType::Number),
        ];

        for (expected_value, expected_type) in tokens {
            let token = lexer.next_token().unwrap();
            assert_eq!(token.value, expected_value);
            assert_eq!(token.token_type, expected_type);
        }
    }

    #[test]
    fn test_lexer_strings() {
        let mut lexer = SqlLexer::new(r#""Файл" "Повторений" "Test \"escaped\"""#);

        let token1 = lexer.next_token().unwrap();
        assert_eq!(token1.value, "Файл");
        assert_eq!(token1.token_type, TokenType::String);

        let token2 = lexer.next_token().unwrap();
        assert_eq!(token2.value, "Повторений");
        assert_eq!(token2.token_type, TokenType::String);

        let token3 = lexer.next_token().unwrap();
        assert_eq!(token3.value, r#"Test "escaped""#);
        assert_eq!(token3.token_type, TokenType::String);
    }

    #[test]
    fn test_lexer_operators() {
        let mut lexer = SqlLexer::new(",");

        let token = lexer.next_token().unwrap();
        assert_eq!(token.value, ",");
        assert_eq!(token.token_type, TokenType::Operator);
        assert!(token.is_operator(','));
    }

    #[test]
    fn test_lexer_mixed() {
        let mut lexer = SqlLexer::new(r#"SELECT file as "Файл", reps"#);

        let tokens = vec![
            ("SELECT", TokenType::Keyword),
            ("file", TokenType::Identifier),
            ("AS", TokenType::Keyword),
            ("Файл", TokenType::String),
            (",", TokenType::Operator),
            ("reps", TokenType::Identifier),
        ];

        for (expected_value, expected_type) in tokens {
            let token = lexer.next_token().unwrap();
            assert_eq!(token.value, expected_value);
            assert_eq!(token.token_type, expected_type);
        }
    }

    #[test]
    fn test_lexer_whitespace() {
        let mut lexer = SqlLexer::new("  SELECT  \n  file  \r\n  reps  ");

        let token1 = lexer.next_token().unwrap();
        assert_eq!(token1.value, "SELECT");
        assert_eq!(token1.token_type, TokenType::Keyword);

        let token2 = lexer.next_token().unwrap();
        assert_eq!(token2.value, "file");
        assert_eq!(token2.token_type, TokenType::Identifier);

        let token3 = lexer.next_token().unwrap();
        assert_eq!(token3.value, "reps");
        assert_eq!(token3.token_type, TokenType::Identifier);
    }

    #[test]
    fn test_lexer_error_unrecognized_char() {
        let mut lexer = SqlLexer::new("SELECT file @ reps");

        let token1 = lexer.next_token().unwrap();
        assert_eq!(token1.value, "SELECT");

        let token2 = lexer.next_token().unwrap();
        assert_eq!(token2.value, "file");

        let result = lexer.next_token();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Нераспознанный символ '@'"));
    }

    #[test]
    fn test_lexer_error_unclosed_string() {
        let mut lexer = SqlLexer::new(r#""unclosed string"#);

        let result = lexer.next_token();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Незакрытая строка"));
    }

    #[test]
    fn test_lexer_with_unicode() {
        let mut lexer = SqlLexer::new(r#"SELECT "Тестовый файл.md" as "Название""#);

        let token1 = lexer.next_token().unwrap();
        assert_eq!(token1.value, "SELECT");
        assert_eq!(token1.token_type, TokenType::Keyword);

        let token2 = lexer.next_token().unwrap();
        assert_eq!(token2.value, "Тестовый файл.md");
        assert_eq!(token2.token_type, TokenType::String);

        let token3 = lexer.next_token().unwrap();
        assert_eq!(token3.value, "AS");
        assert_eq!(token3.token_type, TokenType::Keyword);

        let token4 = lexer.next_token().unwrap();
        assert_eq!(token4.value, "Название");
        assert_eq!(token4.token_type, TokenType::String);
    }
}
