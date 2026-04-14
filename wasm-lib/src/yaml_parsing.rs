// Модуль для парсинга YAML в Rust с использованием serde_yaml

use serde_yaml;
use chrono;
use crate::types::{ModernFsrsCard, ReviewSession, FsrsParameters};

/// Парсит YAML строку в карточку FSRS
pub fn parse_yaml_to_card(yaml_str: &str) -> ModernFsrsCard {
    match serde_yaml::from_str::<ModernFsrsCard>(yaml_str) {
        Ok(card) => card,
        Err(e) => {
            eprintln!("Ошибка парсинга YAML: {}", e);
            create_default_card()
        }
    }
}

/// Преобразует карточку в YAML строку
pub fn card_to_yaml(card: &ModernFsrsCard) -> String {
    match serde_yaml::to_string(card) {
        Ok(yaml) => yaml,
        Err(e) => {
            eprintln!("Ошибка сериализации карточки в YAML: {}", e);
            create_default_yaml()
        }
    }
}

/// Парсит YAML строку с параметрами FSRS
pub fn parse_yaml_to_parameters(yaml_str: &str) -> FsrsParameters {
    match serde_yaml::from_str::<FsrsParameters>(yaml_str) {
        Ok(params) => params,
        Err(e) => {
            eprintln!("Ошибка парсинга параметров YAML: {}", e);
            // Возвращаем дефолтные параметры
            create_default_parameters()
        }
    }
}

/// Преобразует параметры в YAML строку
pub fn parameters_to_yaml(params: &FsrsParameters) -> String {
    match serde_yaml::to_string(params) {
        Ok(yaml) => yaml,
        Err(e) => {
            eprintln!("Ошибка сериализации параметров в YAML: {}", e);
            create_default_parameters_yaml()
        }
    }
}

/// Извлекает FSRS карточку из frontmatter Obsidian
pub fn extract_fsrs_from_frontmatter(frontmatter: &str) -> Option<ModernFsrsCard> {
    // Извлекаем YAML между первым и вторым "---"
    let trimmed = frontmatter.trim();
    let parts: Vec<&str> = trimmed.splitn(3, "---").collect();

    if parts.len() < 3 {
        // Нет закрывающего "---" или недостаточно частей
        return None;
    }

    let yaml_content = parts[1].trim();

    if yaml_content.is_empty() {
        return None;
    }

    // Парсим как общее значение YAML
    let yaml_value: serde_yaml::Value = match serde_yaml::from_str(yaml_content) {
        Ok(value) => value,
        Err(_) => return None, // невалидный YAML
    };

    // Проверяем, содержит ли YAML поле "reviews"
    if let serde_yaml::Value::Mapping(mapping) = &yaml_value {
        if !mapping.contains_key("reviews") {
            return None; // нет поля reviews - не FSRS карточка
        }
    } else {
        return None; // не mapping
    }

    // Теперь пытаемся десериализовать в ModernFsrsCard
    match serde_yaml::from_value(yaml_value) {
        Ok(card) => Some(card),
        Err(e) => {
            eprintln!("Ошибка десериализации YAML в extract_fsrs_from_frontmatter: {}", e);
            None
        }
    }
}

/// Создает frontmatter с FSRS карточкой
pub fn create_frontmatter_with_fsrs(card: &ModernFsrsCard) -> String {
    let yaml_content = card_to_yaml(card);
    format!("---\n{}\n---", yaml_content.trim())
}

/// Создает дефолтную карточку
fn create_default_card() -> ModernFsrsCard {
    ModernFsrsCard {
        reviews: Vec::new(),
    }
}

/// Создает дефолтный YAML
fn create_default_yaml() -> String {
    "reviews: []".to_string()
}

/// Создает дефолтные параметры
fn create_default_parameters() -> FsrsParameters {
    FsrsParameters {
        request_retention: 0.9,
        maximum_interval: 36500.0,
        enable_fuzz: true,
    }
}

/// Создает дефолтный YAML для параметров
fn create_default_parameters_yaml() -> String {
    "request_retention: 0.9\nmaximum_interval: 36500.0\nenable_fuzz: true".to_string()
}

/// Структура для результатов парсинга с детальной информацией об ошибках
pub struct YamlParseResult<T> {
    pub value: T,
    pub had_error: bool,
    pub error_message: Option<String>,
}

impl<T> YamlParseResult<T> {
    pub fn new(value: T, had_error: bool, error_message: Option<String>) -> Self {
        YamlParseResult { value, had_error, error_message }
    }

    pub fn success(value: T) -> Self {
        Self::new(value, false, None)
    }

    pub fn error(value: T, error_msg: &str) -> Self {
        Self::new(value, true, Some(error_msg.to_string()))
    }
}

/// Парсит YAML с детальной информацией об ошибке
pub fn parse_yaml_to_card_with_error(yaml_str: &str) -> YamlParseResult<ModernFsrsCard> {
    match serde_yaml::from_str::<ModernFsrsCard>(yaml_str) {
        Ok(card) => YamlParseResult::success(card),
        Err(e) => {
            YamlParseResult::error(
                create_default_card(),
                &format!("YAML parsing error: {}", e),
            )
        }
    }
}

/// Валидирует сессии повторений в карточке
pub fn validate_review_sessions(card: &ModernFsrsCard) -> Vec<String> {
    let mut errors = Vec::new();

    for (i, session) in card.reviews.iter().enumerate() {
        // Проверяем дату
        if session.date.is_empty() {
            errors.push(format!("Session {}: empty date", i));
            continue;
        }

        // Пробуем парсить дату
        if let Err(e) = chrono::DateTime::parse_from_rfc3339(&session.date) {
            errors.push(format!("Session {}: invalid date format '{}': {}", i, session.date, e));
        }

        // Проверяем рейтинг
        if !["Again", "Hard", "Good", "Easy"].contains(&session.rating.as_str()) {
            errors.push(format!("Session {}: invalid rating '{}'", i, session.rating));
        }

        // Проверяем числовые значения
        if session.stability < 0.0 || session.stability > 1000.0 {
            errors.push(format!("Session {}: stability out of range: {}", i, session.stability));
        }

        if session.difficulty < 1.0 || session.difficulty > 10.0 {
            errors.push(format!("Session {}: difficulty out of range: {}", i, session.difficulty));
        }
    }

    errors
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_yaml_to_card_empty() {
        let yaml = "reviews: []";
        let card = parse_yaml_to_card(yaml);

        assert!(card.reviews.is_empty());
    }

    #[test]
    fn test_parse_yaml_to_card_with_reviews() {
        let yaml = r#"
reviews:
  - date: "2025-01-01T10:00:00Z"
    rating: "Good"
    stability: 5.0
    difficulty: 3.0
  - date: "2025-01-02T14:30:00Z"
    rating: "Easy"
    stability: 8.0
    difficulty: 2.5
"#;
        let card = parse_yaml_to_card(yaml);

        assert_eq!(card.reviews.len(), 2);

        assert_eq!(card.reviews[0].date, "2025-01-01T10:00:00Z");
        assert_eq!(card.reviews[0].rating, "Good");
        assert_eq!(card.reviews[0].stability, 5.0);
        assert_eq!(card.reviews[0].difficulty, 3.0);

        assert_eq!(card.reviews[1].date, "2025-01-02T14:30:00Z");
        assert_eq!(card.reviews[1].rating, "Easy");
        assert_eq!(card.reviews[1].stability, 8.0);
        assert_eq!(card.reviews[1].difficulty, 2.5);
    }

    #[test]
    fn test_parse_yaml_to_card_invalid() {
        // Невалидный YAML должен вернуть дефолтную карточку
        let yaml = "not valid yaml: [";
        let card = parse_yaml_to_card(yaml);

        assert!(card.reviews.is_empty());
    }

    #[test]
    fn test_parse_yaml_to_card_no_reviews_field() {
        let yaml = r#"{}
"#;
        let card = parse_yaml_to_card(yaml);
        assert!(card.reviews.is_empty());

        // parse_yaml_to_card_with_error также должна быть успешной
        let result = parse_yaml_to_card_with_error(yaml);
        assert!(!result.had_error);
        assert!(result.value.reviews.is_empty());
    }

    #[test]
    fn test_card_to_yaml_and_back() {
        let original_card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: "Good".to_string(),
                    stability: 5.0,
                    difficulty: 3.0,
                }
            ],
        };

        let yaml = card_to_yaml(&original_card);
        let parsed_card = parse_yaml_to_card(&yaml);

        assert_eq!(parsed_card.reviews.len(), original_card.reviews.len());
        assert_eq!(parsed_card.reviews[0].date, original_card.reviews[0].date);
        assert_eq!(parsed_card.reviews[0].rating, original_card.reviews[0].rating);
        assert_eq!(parsed_card.reviews[0].stability, original_card.reviews[0].stability);
        assert_eq!(parsed_card.reviews[0].difficulty, original_card.reviews[0].difficulty);
    }

    #[test]
    fn test_parse_yaml_to_parameters() {
        let yaml = r#"
request_retention: 0.85
maximum_interval: 1000.0
enable_fuzz: false
"#;
        let params = parse_yaml_to_parameters(yaml);

        assert_eq!(params.request_retention, 0.85);
        assert_eq!(params.maximum_interval, 1000.0);
        assert_eq!(params.enable_fuzz, false);
    }

    #[test]
    fn test_parameters_to_yaml_and_back() {
        let original_params = FsrsParameters {
            request_retention: 0.85,
            maximum_interval: 1000.0,
            enable_fuzz: false,
        };

        let yaml = parameters_to_yaml(&original_params);
        let parsed_params = parse_yaml_to_parameters(&yaml);

        assert_eq!(parsed_params.request_retention, original_params.request_retention);
        assert_eq!(parsed_params.maximum_interval, original_params.maximum_interval);
        assert_eq!(parsed_params.enable_fuzz, original_params.enable_fuzz);
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter() {
        let frontmatter = r#"---
reviews:
  - date: "2025-01-01T10:00:00Z"
    rating: "Good"
    stability: 5.0
    difficulty: 3.0
---
Some content here"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].rating, "Good");
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_no_fsrs() {
        let frontmatter = r#"---
title: "Test"
tags: [note]
---
Content"#;

        let card = extract_fsrs_from_frontmatter(frontmatter);
        // YAML с полями title и tags не может быть десериализован в ModernFsrsCard
        // поэтому extract_fsrs_from_frontmatter вернет None
        assert!(card.is_none());
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_empty() {
        let frontmatter = "";
        let card = extract_fsrs_from_frontmatter(frontmatter);
        assert!(card.is_none());
    }

    #[test]
    fn test_create_frontmatter_with_fsrs() {
        let card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: "Good".to_string(),
                    stability: 5.0,
                    difficulty: 3.0,
                }
            ],
        };

        let frontmatter = create_frontmatter_with_fsrs(&card);

        assert!(frontmatter.starts_with("---\n"));
        assert!(frontmatter.ends_with("---"));
        assert!(frontmatter.contains("reviews:"));
        assert!(frontmatter.contains("rating: Good"));
        assert!(!frontmatter.contains("srs:")); // Поле srs больше не должно быть
    }

    #[test]
    fn test_parse_yaml_to_card_with_error_valid() {
        let yaml = r#"
reviews:
  - date: "2025-01-01T10:00:00Z"
    rating: "Good"
    stability: 5.0
    difficulty: 3.0
"#;
        let result = parse_yaml_to_card_with_error(yaml);

        assert!(!result.had_error);
        assert!(result.error_message.is_none());
        assert_eq!(result.value.reviews.len(), 1);
    }

    #[test]
    fn test_parse_yaml_to_card_with_error_invalid_yaml() {
        let yaml = "invalid: [yaml";
        let result = parse_yaml_to_card_with_error(yaml);

        assert!(result.had_error);
        assert!(result.error_message.unwrap().contains("YAML parsing error"));
        // Должна вернуться дефолтная карточка
        assert!(result.value.reviews.is_empty());
    }

    #[test]
    fn test_parse_yaml_to_card_with_error_no_reviews() {
        let yaml = r#"{}
"#;
        let result = parse_yaml_to_card_with_error(yaml);

        assert!(!result.had_error);
        assert!(result.value.reviews.is_empty());
    }

    #[test]
    fn test_validate_review_sessions_valid() {
        let card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: "Good".to_string(),
                    stability: 5.0,
                    difficulty: 3.0,
                }
            ],
        };

        let errors = validate_review_sessions(&card);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_review_sessions_invalid_date() {
        let card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "invalid-date".to_string(),
                    rating: "Good".to_string(),
                    stability: 5.0,
                    difficulty: 3.0,
                }
            ],
        };

        let errors = validate_review_sessions(&card);
        assert!(!errors.is_empty());
        assert!(errors[0].contains("invalid date format"));
    }

    #[test]
    fn test_validate_review_sessions_invalid_rating() {
        let card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: "InvalidRating".to_string(),
                    stability: 5.0,
                    difficulty: 3.0,
                }
            ],
        };

        let errors = validate_review_sessions(&card);
        assert!(!errors.is_empty());
        assert!(errors[0].contains("invalid rating"));
    }

    #[test]
    fn test_validate_review_sessions_out_of_range() {
        let card = ModernFsrsCard {
            reviews: vec![
                ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: "Good".to_string(),
                    stability: -5.0, // отрицательная стабильность
                    difficulty: 15.0, // сложность вне диапазона
                }
            ],
        };

        let errors = validate_review_sessions(&card);
        assert_eq!(errors.len(), 2);
        assert!(errors[0].contains("stability out of range"));
        assert!(errors[1].contains("difficulty out of range"));
    }
}
