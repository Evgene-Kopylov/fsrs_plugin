use crate::types::{FsrsParameters, ReviewSession};

use chrono::{DateTime, Utc};
use rs_fsrs::{Card, State};

/// Создает Card из истории reviews
pub fn create_card_from_last_session(
    reviews: &[ReviewSession],
    default_stability: f64,
    default_difficulty: f64,
    parameters: &FsrsParameters,
) -> Card {
    if reviews.is_empty() {
        // Нет сессий - создаем новую карточку с дефолтными значениями
        let now = Utc::now();
        Card {
            stability: default_stability,
            difficulty: default_difficulty,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            state: State::New,
            due: now,
            last_review: now,
        }
    } else {
        // Парсим дату последней сессии
        let last_session = reviews.last().unwrap();
        let last_review: DateTime<Utc> = last_session.date.parse().unwrap_or_else(|_| Utc::now());

        // Вычисляем reps и lapses на основе истории
        let mut reps = 0;
        let mut lapses = 0;
        let mut had_successful_review = false;

        for session in reviews {
            // Каждая сессия — это одно повторение
            reps += 1;

            match session.rating.as_str() {
                "Again" => {
                    if had_successful_review {
                        lapses += 1;
                    }
                }
                _ => {
                    had_successful_review = true;
                }
            }
        }

        // Определяем состояние карточки на основе стабильности
        let state = if last_session.stability < 1.0 {
            State::Learning
        } else {
            State::Review
        };

        // Вычисляем интервал по формуле FSRS: I = S * ln(r) / ln(0.9)
        // где I - интервал, S - стабильность, r - целевая запоминаемость
        let request_retention = parameters.request_retention;
        let stability = last_session.stability;

        let mut interval_days = if request_retention > 0.0 && request_retention <= 1.0 {
            (stability * request_retention.ln() / 0.9f64.ln()).max(1.0)
        } else {
            stability.max(1.0)
        };

        // Применяем максимальный интервал
        interval_days = interval_days.min(parameters.maximum_interval);

        // Вычисляем дату следующего повторения
        let due_date = last_review + chrono::Duration::days(interval_days as i64);

        // Создаем карточку с данными из последней сессии
        Card {
            stability: last_session.stability,
            difficulty: last_session.difficulty,
            elapsed_days: 0, // будет вычислено при следующем повторении
            scheduled_days: interval_days as i64,
            reps,
            lapses,
            state,
            due: due_date,
            last_review,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};

    fn create_test_parameters() -> FsrsParameters {
        FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 365.0,
            enable_fuzz: false,
        }
    }

    fn create_test_review_session(
        date_str: &str,
        rating: &str,
        stability: f64,
        difficulty: f64,
    ) -> ReviewSession {
        ReviewSession {
            date: date_str.to_string(),
            rating: rating.to_string(),
            stability,
            difficulty,
        }
    }

    #[test]
    fn test_create_card_from_last_session_empty_reviews() {
        let params = create_test_parameters();
        let default_stability = 2.5;
        let default_difficulty = 5.0;

        let card =
            create_card_from_last_session(&[], default_stability, default_difficulty, &params);

        assert_eq!(card.stability, default_stability);
        assert_eq!(card.difficulty, default_difficulty);
        assert_eq!(card.reps, 0);
        assert_eq!(card.lapses, 0);
        assert_eq!(card.state, State::New);
        assert_eq!(card.elapsed_days, 0);
        assert_eq!(card.scheduled_days, 0);
        // due и last_review должны быть близки к текущему времени
        let now = Utc::now();
        let diff_seconds = (card.due - now).num_seconds().abs();
        assert!(diff_seconds < 2);
    }

    #[test]
    fn test_create_card_from_last_session_with_single_review() {
        let params = create_test_parameters();
        let reviews = vec![create_test_review_session(
            "2025-01-01T10:00:00Z",
            "Good",
            5.0,
            3.0,
        )];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert_eq!(card.stability, 5.0);
        assert_eq!(card.difficulty, 3.0);
        assert_eq!(card.reps, 1);
        assert_eq!(card.lapses, 0);
        assert_eq!(card.state, State::Review); // stability >= 1.0
        assert_eq!(card.elapsed_days, 0);

        // Проверяем, что due дата вычислена корректно (после last_review)
        let last_review: DateTime<Utc> = "2025-01-01T10:00:00Z".parse().unwrap();
        assert!(card.due > last_review);
        assert!(card.last_review == last_review);
    }

    #[test]
    fn test_create_card_from_last_session_with_multiple_reviews() {
        let params = create_test_parameters();
        let reviews = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Good", 2.0, 5.0),
            create_test_review_session("2025-01-03T10:00:00Z", "Easy", 8.0, 3.0),
        ];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        // Должны использоваться значения из последней сессии
        assert_eq!(card.stability, 8.0);
        assert_eq!(card.difficulty, 3.0);
        // reps: все три сессии (3), lapses: 0 (Again был первым, до успешного повторения)
        assert_eq!(card.reps, 3);
        assert_eq!(card.lapses, 0);
        assert_eq!(card.state, State::Review); // stability >= 1.0
    }

    #[test]
    fn test_create_card_from_last_session_learning_state() {
        let params = create_test_parameters();
        let reviews = vec![create_test_review_session(
            "2025-01-01T10:00:00Z",
            "Again",
            0.8,
            7.0,
        )];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert_eq!(card.stability, 0.8);
        assert_eq!(card.state, State::Learning); // stability < 1.0
    }

    #[test]
    fn test_create_card_from_last_session_with_invalid_date() {
        let params = create_test_parameters();
        let reviews = vec![ReviewSession {
            date: "invalid date".to_string(),
            rating: "Good".to_string(),
            stability: 5.0,
            difficulty: 3.0,
        }];

        // Не должно паниковать, должно использовать текущее время
        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert_eq!(card.stability, 5.0);
        assert_eq!(card.difficulty, 3.0);
        // last_review должно быть близко к текущему времени
        let now = Utc::now();
        let last_review_diff = (card.last_review - now).num_seconds().abs();
        assert!(last_review_diff < 5);
        // due должно быть позже last_review
        assert!(card.due > card.last_review);
    }

    #[test]
    fn test_create_card_from_last_session_lapses_calculation() {
        let params = create_test_parameters();

        // Test 1: Again before any successful review -> lapses = 0
        let reviews1 = vec![create_test_review_session(
            "2025-01-01T10:00:00Z",
            "Again",
            0.5,
            8.0,
        )];
        let card1 = create_card_from_last_session(&reviews1, 2.5, 5.0, &params);
        assert_eq!(card1.lapses, 0);
        assert_eq!(card1.reps, 1);

        // Test 2: Good then Again -> lapses = 1
        let reviews2 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Good", 5.0, 3.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Again", 0.8, 7.0),
        ];
        let card2 = create_card_from_last_session(&reviews2, 2.5, 5.0, &params);
        assert_eq!(card2.lapses, 1);
        assert_eq!(card2.reps, 2);

        // Test 3: Good, Good, Again -> lapses = 1 (only one lapse after successful)
        let reviews3 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Good", 5.0, 3.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Good", 8.0, 2.5),
            create_test_review_session("2025-01-03T10:00:00Z", "Again", 0.8, 7.0),
        ];
        let card3 = create_card_from_last_session(&reviews3, 2.5, 5.0, &params);
        assert_eq!(card3.lapses, 1);
        assert_eq!(card3.reps, 3);

        // Test 4: Again, Good, Again -> lapses = 1
        let reviews4 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Good", 2.0, 5.0),
            create_test_review_session("2025-01-03T10:00:00Z", "Again", 0.8, 7.0),
        ];
        let card4 = create_card_from_last_session(&reviews4, 2.5, 5.0, &params);
        assert_eq!(card4.lapses, 1);
        assert_eq!(card4.reps, 3);

        // Test 5: Again, Again, Good -> lapses = 0 (no successful review before Again)
        let reviews5 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Again", 0.3, 9.0),
            create_test_review_session("2025-01-03T10:00:00Z", "Good", 2.0, 5.0),
        ];
        let card5 = create_card_from_last_session(&reviews5, 2.5, 5.0, &params);
        assert_eq!(card5.lapses, 0);
        assert_eq!(card5.reps, 3);
    }
}
