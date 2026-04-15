// Модуль для парсинга YAML в Rust с использованием serde_yaml

use crate::types::{ModernFsrsCard, FsrsParameters, ReviewSession};

#[cfg(target_arch = "wasm32")]
#[allow(unused_imports)]
use web_sys::console;

/// Макросы для логирования с разными уровнями, работающие как в WASM, так и в нативных тестах
macro_rules! log_trace {
    ($($arg:tt)*) => {
        #[cfg(target_arch = "wasm32")]
        web_sys::console::debug_1(&format!($($arg)*).into());
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("TRACE: {}", format!($($arg)*));
    };
}





macro_rules! log_warn {
    ($($arg:tt)*) => {
        #[cfg(target_arch = "wasm32")]
        web_sys::console::warn_1(&format!($($arg)*).into());
        #[cfg(not(target_arch = "wasm32"))]
        eprintln!("WARN: {}", format!($($arg)*));
    };
}



/// Парсит YAML строку в карточку FSRS
pub fn parse_yaml_to_card(yaml_str: &str) -> ModernFsrsCard {
    match serde_yaml::from_str::<ModernFsrsCard>(yaml_str) {
        Ok(card) => card,
        Err(e) => {
            log_warn!("Ошибка парсинга YAML: {}", e);
            create_default_card()
        }
    }
}

/// Преобразует карточку в YAML строку
pub fn card_to_yaml(card: &ModernFsrsCard) -> String {
    match serde_yaml::to_string(card) {
        Ok(yaml) => yaml,
        Err(e) => {
            log_warn!("Ошибка сериализации карточки в YAML: {}", e);
            create_default_yaml()
        }
    }
}

/// Парсит YAML строку с параметрами FSRS
pub fn parse_yaml_to_parameters(yaml_str: &str) -> FsrsParameters {
    match serde_yaml::from_str::<FsrsParameters>(yaml_str) {
        Ok(params) => params,
        Err(e) => {
            log_warn!("Ошибка парсинга параметров YAML: {}", e);
            // Возвращаем дефолтные параметры
            create_default_parameters()
        }
    }
}

/// Извлекает FSRS карточку из frontmatter Obsidian
pub fn extract_fsrs_from_frontmatter(frontmatter: &str) -> Option<ModernFsrsCard> {
    log_trace!("extract_fsrs_from_frontmatter called with frontmatter length: {}", frontmatter.len());

    // Извлекаем YAML между первым и вторым "---"
    let trimmed = frontmatter.trim();
    log_trace!("trimmed frontmatter length: {}", trimmed.len());

    let parts: Vec<&str> = trimmed.splitn(3, "---").collect();
    log_trace!("parts length: {}", parts.len());

    if parts.len() < 3 {
        // Нет закрывающего "---" или недостаточно частей
        log_trace!("Not enough parts (missing closing '---')");
        return None;
    }

    let yaml_content = parts[1].trim();
    log_trace!("yaml_content length: {}", yaml_content.len());
    log_trace!("yaml_content first 200 chars: {}", &yaml_content[..yaml_content.len().min(200)]);

    if yaml_content.is_empty() {
        log_trace!("yaml_content is empty");
        return None;
    }

    // Парсим как общее значение YAML
    log_trace!("Parsing YAML with serde_yaml");
    let yaml_value: serde_yaml::Value = match serde_yaml::from_str(yaml_content) {
        Ok(value) => {
            log_trace!("YAML parsed successfully, type: {:?}", value);
            value
        },
        Err(e) => {
            log_warn!("YAML parsing error: {}", e);
            return None; // невалидный YAML
        }
    };

    // Проверяем, содержит ли YAML поле "reviews"
    log_trace!("Checking for 'reviews' field");
    let reviews = if let serde_yaml::Value::Mapping(mapping) = &yaml_value {
        if !mapping.contains_key("reviews") {
            log_trace!("YAML does not contain 'reviews' field");
            return None; // нет поля reviews - не FSRS карточка
        }

        log_trace!("'reviews' field found");
        // Извлекаем только поле reviews
        match mapping.get("reviews") {
            Some(serde_yaml::Value::Sequence(seq)) => {
                log_trace!("reviews is a sequence with {} elements", seq.len());
                // Десериализуем reviews
                match serde_yaml::from_value::<Vec<ReviewSession>>(serde_yaml::Value::Sequence(seq.clone())) {
                    Ok(reviews) => {
                        log_trace!("Successfully deserialized {} review sessions", reviews.len());
                        reviews
                    },
                    Err(e) => {
                        log_warn!("Error deserializing reviews: {}", e);
                        return None;
                    }
                }
            }
            other => {
                log_warn!("reviews is not a sequence, type: {:?}", other);
                return None; // reviews не является массивом
            }
        }
    } else {
        log_warn!("YAML is not a mapping");
        return None; // не mapping
    };

    log_trace!("Creating ModernFsrsCard with {} reviews", reviews.len());
    // Создаем карточку с reviews и без file_path (он будет добавлен позже)
    Some(ModernFsrsCard {
        reviews,
        file_path: None,
    })
}

/// Создает frontmatter с FSRS карточкой
pub fn create_frontmatter_with_fsrs(card: &ModernFsrsCard) -> String {
    let yaml_content = card_to_yaml(card);
    format!("---\n{}\n---", yaml_content.trim())
}

/// Создает дефолтную карточку
pub fn create_default_card() -> ModernFsrsCard {
    ModernFsrsCard {
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
            file_path: None,
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
            file_path: None,
        };

        let frontmatter = create_frontmatter_with_fsrs(&card);

        assert!(frontmatter.starts_with("---\n"));
        assert!(frontmatter.ends_with("---"));
        assert!(frontmatter.contains("reviews:"));
        assert!(frontmatter.contains("rating: Good"));
        assert!(!frontmatter.contains("srs:")); // Поле srs больше не должно быть
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
            file_path: None,
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
            file_path: None,
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
            file_path: None,
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
            file_path: None,
        };

        let errors = validate_review_sessions(&card);
        assert_eq!(errors.len(), 2);
        assert!(errors[0].contains("stability out of range"));
        assert!(errors[1].contains("difficulty out of range"));
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_real_example() {
        // Реальный пример из тестового файла 04-Высокая-стабильность.md
        let frontmatter = r#"---
reviews:
  - date: 2026-04-13T09:00:00+02:00
    rating: Good
    stability: 25.8
    difficulty: 2.3
---"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].date, "2026-04-13T09:00:00+02:00");
        assert_eq!(card.reviews[0].rating, "Good");
        assert_eq!(card.reviews[0].stability, 25.8);
        assert_eq!(card.reviews[0].difficulty, 2.3);
    }

    #[test]
    fn test_extract_fsrs_from_frontmatter_with_srs_field() {
        // Пример с полем srs: true (старый формат, но должен работать)
        let frontmatter = r#"---
srs: true
reviews:
  - date: 2026-04-13T09:00:00+02:00
    rating: Good
    stability: 25.8
    difficulty: 2.3
---"#;

        let card = extract_fsrs_from_frontmatter(frontmatter).unwrap();

        assert_eq!(card.reviews.len(), 1);
        assert_eq!(card.reviews[0].date, "2026-04-13T09:00:00+02:00");
        assert_eq!(card.reviews[0].rating, "Good");
        assert_eq!(card.reviews[0].stability, 25.8);
        assert_eq!(card.reviews[0].difficulty, 2.3);
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
