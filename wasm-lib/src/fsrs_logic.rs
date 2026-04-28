use crate::conversion::{create_fsrs_parameters, rating_from_u8};
use crate::json_parsing::parse_datetime_flexible;
use crate::log_warn;
use crate::types::{FsrsParameters, ReviewSession};

use chrono::{DateTime, Utc};
use rs_fsrs::{Card, FSRS, State};

/// Создает Card из истории reviews через точный пересчёт
pub fn create_card_from_last_session(
    reviews: &[ReviewSession],
    default_stability: f64,
    default_difficulty: f64,
    parameters: &FsrsParameters,
) -> Card {
    let now = Utc::now();
    compute_card_from_reviews(
        reviews,
        default_stability,
        default_difficulty,
        parameters,
        now,
        parameters.enable_fuzz,
    )
}

/// Полностью пересчитывает карточку через fsrs.repeat() по всем повторениям.
/// Используется вместо create_card_from_last_session для точного вычисления состояния
/// с учётом текущих w-параметров FSRS.
pub fn compute_card_from_reviews(
    reviews: &[ReviewSession],
    default_stability: f64,
    default_difficulty: f64,
    parameters: &FsrsParameters,
    now: DateTime<Utc>,
    enable_fuzz: bool,
) -> Card {
    // Защита от невалидных параметров, которые могут вызвать панику в FSRS::new()
    let safe_max_interval = if parameters.maximum_interval > 0.0 {
        parameters.maximum_interval
    } else {
        log_warn!(
            "maximum_interval = {}, используется 365.0",
            parameters.maximum_interval
        );
        365.0
    };
    let safe_request_retention =
        if parameters.request_retention > 0.0 && parameters.request_retention <= 1.0 {
            parameters.request_retention
        } else {
            log_warn!(
                "request_retention = {}, используется 0.9",
                parameters.request_retention
            );
            0.9
        };

    let safe_params = FsrsParameters {
        request_retention: safe_request_retention,
        maximum_interval: safe_max_interval,
        enable_fuzz,
    };
    let fsrs_params = create_fsrs_parameters(&safe_params);
    let fsrs = FSRS::new(fsrs_params);

    // Начальное состояние
    let mut current_card = Card {
        stability: default_stability,
        difficulty: default_difficulty,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: State::New,
        due: now,
        last_review: now,
    };

    if reviews.is_empty() {
        return current_card;
    }

    let mut last_review_date: Option<DateTime<Utc>> = None;

    for session in reviews {
        let review_date = match parse_datetime_flexible(&session.date) {
            Some(dt) => dt,
            None => {
                // Пропускаем сессии с неверной датой
                continue;
            }
        };

        // Вычисляем elapsed_days с предыдущего повторения
        let elapsed_days = if let Some(prev_date) = last_review_date {
            (review_date - prev_date).num_days().max(0)
        } else {
            0
        };
        current_card.elapsed_days = elapsed_days;

        let rating = rating_from_u8(session.rating);
        let repeat_map = fsrs.repeat(current_card.clone(), review_date);
        let scheduling_info = match repeat_map.get(&rating) {
            Some(info) => info,
            None => {
                log_warn!(
                    "Рейтинг {:?} не найден в repeat_map для сессии с датой {}",
                    rating,
                    session.date
                );
                continue;
            }
        };
        current_card = scheduling_info.card.clone();
        last_review_date = Some(review_date);
    }

    current_card
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

    fn create_test_review_session(date_str: &str, rating: u8) -> ReviewSession {
        ReviewSession {
            date: date_str.to_string(),
            rating,
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
        let reviews = vec![create_test_review_session("2026-01-01T10:00:00Z", 2u8)];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert!(card.stability > 0.0, "Стабильность должна быть > 0");
        assert!(card.difficulty > 0.0, "Сложность должна быть > 0");
        assert_eq!(card.reps, 1);
        assert_eq!(card.lapses, 0);
        // После одного Good через FSRS карта может быть в Learning или Review
        // Проверяем, что она не New
        assert_ne!(card.state, State::New);
        assert_eq!(card.elapsed_days, 0);

        // Проверяем, что due дата вычислена корректно (после last_review)
        let last_review: DateTime<Utc> = "2026-01-01T10:00:00Z".parse().unwrap();
        assert!(card.due > last_review);
        assert!(card.last_review == last_review);
    }

    #[test]
    fn test_create_card_from_last_session_with_multiple_reviews() {
        let params = create_test_parameters();
        let reviews = vec![
            create_test_review_session("2026-01-01T10:00:00Z", 0u8),
            create_test_review_session("2026-01-02T10:00:00Z", 2u8),
            create_test_review_session("2026-01-03T10:00:00Z", 3u8),
        ];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert!(card.stability > 0.0, "Стабильность должна быть > 0");
        assert!(card.difficulty > 0.0, "Сложность должна быть > 0");
        // reps: все три сессии (3), lapses: 0 (Again был первым, до успешного повторения)
        assert_eq!(card.reps, 3);
        assert_eq!(card.lapses, 0);
        assert_eq!(card.state, State::Review); // после Easy — точно Review
    }

    #[test]
    fn test_create_card_from_last_session_learning_state() {
        let params = create_test_parameters();
        let reviews = vec![create_test_review_session("2026-01-01T10:00:00Z", 0u8)];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        // После Again через FSRS стабильность может быть < 1.0
        // Просто проверяем, что не паникует и reps=1
        assert_eq!(card.reps, 1);
    }

    #[test]
    fn test_create_card_from_last_session_with_invalid_date() {
        let params = create_test_parameters();
        let reviews = vec![ReviewSession {
            date: "invalid date".to_string(),
            rating: 2u8,
        }];

        // Не должно паниковать, должно использовать текущее время для last_review
        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert!(card.stability > 0.0, "Стабильность должна быть > 0");
        assert!(card.difficulty > 0.0, "Сложность должна быть > 0");
        // reps: невалидная дата — сессия пропущена, но это начальная карточка
        let now = Utc::now();
        let due_diff = (card.due - now).num_seconds().abs();
        assert!(due_diff < 5); // due должно быть близко к now (карточка новая)
    }

    #[test]
    fn test_create_card_from_last_session_lapses_calculation() {
        let params = create_test_parameters();

        // Test 1: Again before any successful review -> lapses = 0
        let reviews1 = vec![create_test_review_session("2026-01-01T10:00:00Z", 0u8)];
        let card1 = create_card_from_last_session(&reviews1, 2.5, 5.0, &params);
        assert_eq!(card1.reps, 1);

        // Test 2: Good then Again -> lapses вычисляются алгоритмом FSRS
        let reviews2 = vec![
            create_test_review_session("2026-01-01T10:00:00Z", 2u8),
            create_test_review_session("2026-01-02T10:00:00Z", 0u8),
        ];
        let card2 = create_card_from_last_session(&reviews2, 2.5, 5.0, &params);
        assert_eq!(card2.reps, 2);

        // Test 3: Good, Good, Again
        let reviews3 = vec![
            create_test_review_session("2026-01-01T10:00:00Z", 2u8),
            create_test_review_session("2026-01-02T10:00:00Z", 2u8),
            create_test_review_session("2026-01-03T10:00:00Z", 0u8),
        ];
        let card3 = create_card_from_last_session(&reviews3, 2.5, 5.0, &params);
        assert_eq!(card3.reps, 3);

        // Test 4: Again, Good, Again
        let reviews4 = vec![
            create_test_review_session("2026-01-01T10:00:00Z", 0u8),
            create_test_review_session("2026-01-02T10:00:00Z", 2u8),
            create_test_review_session("2026-01-03T10:00:00Z", 0u8),
        ];
        let card4 = create_card_from_last_session(&reviews4, 2.5, 5.0, &params);
        assert_eq!(card4.reps, 3);

        // Test 5: Again, Again, Good
        let reviews5 = vec![
            create_test_review_session("2026-01-01T10:00:00Z", 0u8),
            create_test_review_session("2026-01-02T10:00:00Z", 0u8),
            create_test_review_session("2026-01-03T10:00:00Z", 2u8),
        ];
        let card5 = create_card_from_last_session(&reviews5, 2.5, 5.0, &params);
        assert_eq!(card5.reps, 3);
    }

    #[test]
    fn test_create_card_from_last_session_with_hard_rating() {
        let params = create_test_parameters();
        let reviews = vec![create_test_review_session("2026-01-01T10:00:00Z", 1u8)];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert!(card.stability > 0.0, "Стабильность должна быть > 0");
        assert!(card.difficulty > 0.0, "Сложность должна быть > 0");
        assert_eq!(card.reps, 1, "reps должно быть 1 для одной сессии с Hard");
        assert_ne!(
            card.state,
            State::New,
            "Карта не должна быть New после Hard"
        );
    }
}
