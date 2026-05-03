// Модуль для парсинга YAML в Rust с использованием serde_yaml

use crate::json_parsing::parse_datetime_flexible;
use crate::types::{CardData, FsrsParameters, ReviewSession};

/// Макрос для логирования предупреждений, работает в нативных тестах.
/// В WASM не выводит ничего — ошибки обрабатываются на стороне TypeScript.
macro_rules! log_warn {
    ($($arg:tt)*) => {
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("⚠️ WARN: {}", format!($($arg)*));
    };
}

/// Парсит YAML строку в карточку FSRS
pub fn parse_yaml_to_card(yaml_str: &str) -> CardData {
    match serde_yaml::from_str::<CardData>(yaml_str) {
        Ok(card) => card,
        Err(_e) => {
            log_warn!("Ошибка парсинга YAML: {}", _e);
            create_default_card()
        }
    }
}

/// Преобразует карточку в YAML строку
pub fn card_to_yaml(card: &CardData) -> String {
    match serde_yaml::to_string(card) {
        Ok(yaml) => yaml,
        Err(_e) => {
            log_warn!("Ошибка сериализации карточки в YAML: {}", _e);
            create_default_yaml()
        }
    }
}

/// Парсит YAML строку с параметрами FSRS
pub fn parse_yaml_to_parameters(yaml_str: &str) -> FsrsParameters {
    match serde_yaml::from_str::<FsrsParameters>(yaml_str) {
        Ok(params) => params,
        Err(_e) => {
            log_warn!("Ошибка парсинга параметров YAML: {}", _e);
            // Возвращаем дефолтные параметры
            create_default_parameters()
        }
    }
}

/// Извлекает FSRS карточку из frontmatter Obsidian
pub fn extract_fsrs_from_frontmatter(frontmatter: &str) -> Option<CardData> {
    // Извлекаем YAML между первым и вторым "---"
    let trimmed = frontmatter.trim();
    let parts: Vec<&str> = trimmed.splitn(3, "---").collect();

    if parts.len() < 3 {
        return None;
    }

    let yaml_content = parts[1].trim();

    if yaml_content.is_empty() {
        return None;
    }

    // Парсим как общее значение YAML
    let yaml_value: serde_yaml::Value = match serde_yaml::from_str(yaml_content) {
        Ok(value) => value,
        Err(_e) => {
            log_warn!("YAML parsing error: {}", _e);
            return None;
        }
    };

    // Проверяем, содержит ли YAML поле "reviews"
    let reviews = if let serde_yaml::Value::Mapping(mapping) = &yaml_value {
        if !mapping.contains_key("reviews") {
            return None;
        }

        // Извлекаем только поле reviews
        match mapping.get("reviews") {
            Some(serde_yaml::Value::Sequence(seq)) => {
                // Если массив пустой — это валидная карточка без сессий
                if seq.is_empty() {
                    return Some(CardData {
                        reviews: Vec::new(),
                        file_path: None,
                    });
                }
                // Десериализуем reviews
                let mut validated_reviews = Vec::new();
                for (_i, session_value) in seq.iter().enumerate() {
                    if let Some(session) = validate_review_session(session_value) {
                        validated_reviews.push(session);
                    } else {
                        log_warn!("Invalid review session at index {}, skipping", _i);
                    }
                }
                if validated_reviews.is_empty() {
                    log_warn!("No valid review sessions found");
                    return None;
                }
                validated_reviews
            }
            _other => {
                log_warn!("reviews is not a sequence, type: {:?}", _other);
                return None;
            }
        }
    } else {
        log_warn!("YAML is not a mapping");
        return None;
    };

    // Создаем карточку с reviews и без file_path (он будет добавлен позже)
    Some(CardData {
        reviews,
        file_path: None,
    })
}

/// Создает frontmatter с FSRS карточкой
pub fn create_frontmatter_with_fsrs(card: &CardData) -> String {
    let yaml_content = card_to_yaml(card);
    format!("---\n{}\n---", yaml_content.trim())
}

/// Создает дефолтную карточку
pub fn create_default_card() -> CardData {
    CardData {
        reviews: Vec::new(),
        file_path: None,
    }
}

/// Создает дефолтный YAML
fn create_default_yaml() -> String {
    "reviews: []".to_string()
}

/// Создает дефолтные параметры
pub fn create_default_parameters() -> FsrsParameters {
    FsrsParameters {
        request_retention: 0.9,
        maximum_interval: 36500.0,
        enable_fuzz: true,
    }
}

/// Валидирует сессии повторений в карточке
fn validate_review_session(session: &serde_yaml::Value) -> Option<ReviewSession> {
    let date_str = session.get("date")?.as_str()?;
    let date = parse_datetime_flexible(date_str)?;
    let rating = session.get("rating")?.as_i64()?;
    if !(0..=3).contains(&rating) {
        return None;
    }
    Some(ReviewSession {
        date: date.to_rfc3339(),
        rating: rating as u8,
    })
}

pub fn validate_review_sessions(card: &CardData) -> Vec<String> {
    let mut errors = Vec::new();

    for (i, session) in card.reviews.iter().enumerate() {
        // Проверяем дату
        if session.date.is_empty() {
            errors.push(format!("Session {}: empty date", i));
            continue;
        }

        // Пробуем парсить дату
        if parse_datetime_flexible(&session.date).is_none() {
            errors.push(format!(
                "Session {}: invalid date format '{}'",
                i, session.date
            ));
        }

        // Проверяем рейтинг
        if !(0..=3).contains(&session.rating) {
            errors.push(format!(
                "Session {}: invalid rating '{}'",
                i, session.rating
            ));
        }
    }

    if !errors.is_empty() {
        log_warn!("Review session validation errors: {:?}", errors);
    }

    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ReviewSession;

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
  - date: "2026-01-01T10:00:00Z"
    rating: 2
  - date: "2026-01-02T14:30:00Z"
    rating: 3
"#;
        let card = parse_yaml_to_card(yaml);

        assert_eq!(card.reviews.len(), 2);

        assert_eq!(card.reviews[0].date, "2026-01-01T10:00:00Z");
        assert_eq!(card.reviews[0].rating, 2u8);

        assert_eq!(card.reviews[1].date, "2026-01-02T14:30:00Z");
        assert_eq!(card.reviews[1].rating, 3u8);
    }

    #[test]
    fn test_parse_yaml_to_card_invalid() {
        // Невалидный YAML должен вернуть дефолтную карточку
        let yaml = "not valid yaml: [";
        let card = parse_yaml_to_card(yaml);

        assert!(card.reviews.is_empty());
    }

    #[test]
    fn test_card_to_yaml_and_back() {
        let original_card = CardData {
            reviews: vec![ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 2u8,
            }],
            file_path: None,
        };

        let yaml = card_to_yaml(&original_card);
        let parsed_card = parse_yaml_to_card(&yaml);

        assert_eq!(parsed_card.reviews.len(), original_card.reviews.len());
        assert_eq!(parsed_card.reviews[0].date, original_card.reviews[0].date);
        assert_eq!(
            parsed_card.reviews[0].rating,
            original_card.reviews[0].rating
        );
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
    fn test_extract_fsrs_from_frontmatter() {
        let frontmatter = r#"---
reviews:
  - date: "2026-01-01T10:00:00Z"
    rating: 2
---
Some content here"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].rating, 2u8);
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_no_fsrs() {
        let frontmatter = r#"---
title: "Test"
tags: [note]
---
Content"#;

        let card = extract_fsrs_from_frontmatter(frontmatter);
        // YAML с полями title и tags не может быть десериализован в CardData
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
        let card = CardData {
            reviews: vec![ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 2u8,
            }],
            file_path: None,
        };

        let frontmatter = create_frontmatter_with_fsrs(&card);

        assert!(frontmatter.starts_with("---\n"));
        assert!(frontmatter.ends_with("---"));
        assert!(frontmatter.contains("reviews:"));
        assert!(frontmatter.contains("rating: 2"));
        assert!(!frontmatter.contains("srs:")); // Поле srs больше не должно быть
    }

    #[test]
    fn test_validate_review_sessions_valid() {
        let card = CardData {
            reviews: vec![ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 2u8,
            }],
            file_path: None,
        };

        let errors = validate_review_sessions(&card);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_review_sessions_invalid_date() {
        let card = CardData {
            reviews: vec![ReviewSession {
                date: "invalid-date".to_string(),
                rating: 2u8,
            }],
            file_path: None,
        };

        let errors = validate_review_sessions(&card);
        assert!(!errors.is_empty());
        assert!(errors[0].contains("invalid date format"));
    }

    #[test]
    fn test_validate_review_sessions_invalid_rating() {
        let card = CardData {
            reviews: vec![ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 255u8,
            }],
            file_path: None,
        };

        let errors = validate_review_sessions(&card);
        assert!(!errors.is_empty());
        assert!(errors[0].contains("invalid rating"));
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_real_example() {
        // Реальный пример из тестового файла 04-Высокая-стабильность.md
        let frontmatter = r#"---
reviews:
  - date: 2026-04-13T09:00:00+02:00
    rating: 2
    stability: 25.8
    difficulty: 2.3
---"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].date, "2026-04-13T07:00:00+00:00");
        assert_eq!(card.reviews[0].rating, 2u8);
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_with_srs_field() {
        // Пример с полем srs: true (старый формат, но должен работать)
        let frontmatter = r#"---
srs: true
reviews:
  - date: 2026-04-13T09:00:00+02:00
    rating: 2
    stability: 25.8
    difficulty: 2.3
---"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].date, "2026-04-13T07:00:00+00:00");
        assert_eq!(card.reviews[0].rating, 2u8);
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_with_srs_and_empty_reviews() {
        // Пример с полем srs: true и пустым массивом reviews
        let frontmatter = r#"---
srs: true
reviews: []
---"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 0);
    }
}
