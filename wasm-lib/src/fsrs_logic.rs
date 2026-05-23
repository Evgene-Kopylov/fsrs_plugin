use crate::conversion::{rating_to_u32, state_label};
use crate::fsrs_schedule::{self, MemoryState, next_states as schedule_next_states};
use crate::json_parsing::parse_datetime_flexible;
use crate::log_warn;
use crate::types::{FsrsCard, FsrsParameters, ReviewSession};

use chrono::{DateTime, Utc};

/// Полностью пересчитывает состояние карточки через fsrs.next_states()
/// по всем повторениям. Возвращает FsrsCard с MemoryState и метаданными.
pub fn compute_card_from_reviews(
    reviews: &[ReviewSession],
    default_stability: f64,
    default_difficulty: f64,
    parameters: &FsrsParameters,
) -> FsrsCard {
    let retention = if parameters.request_retention > 0.0 && parameters.request_retention <= 1.0 {
        parameters.request_retention as f32
    } else {
        log_warn!(
            "request_retention = {}, используется 0.9",
            parameters.request_retention
        );
        0.9
    };

    let w = &parameters.w;

    let default_card = FsrsCard {
        stability: default_stability as f32,
        difficulty: default_difficulty as f32,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        last_rating: None,
    };

    if reviews.is_empty() {
        return default_card;
    }

    let mut state: Option<MemoryState> = None;
    let mut last_review_date: Option<DateTime<Utc>> = None;
    let mut reps: u32 = 0;
    let mut lapses: u32 = 0;
    let mut last_rating: Option<u32> = None;
    let mut last_scheduled_days: u32 = 0;

    for session in reviews {
        let review_date = match parse_datetime_flexible(&session.date) {
            Some(dt) => dt,
            None => {
                log_warn!("Неверная дата в сессии: {}", session.date);
                continue;
            }
        };

        let elapsed_days = if let Some(prev_date) = last_review_date {
            (review_date - prev_date).num_days().max(0) as u32
        } else {
            0
        };

        let rating = rating_to_u32(session.rating);
        let next = schedule_next_states(state, retention, elapsed_days, w);

        let item_state = match rating {
            1 => &next.again,
            2 => &next.hard,
            3 => &next.good,
            4 => &next.easy,
            _ => {
                log_warn!("Неизвестный рейтинг: {}", rating);
                continue;
            }
        };

        state = Some(item_state.memory);
        reps += 1;
        if rating == 1 {
            lapses += 1;
        }
        last_rating = Some(rating);
        last_review_date = Some(review_date);
        last_scheduled_days = item_state.interval.round().max(1.0) as u32;
    }

    let (stability, difficulty) = match state {
        Some(s) => {
            let stab = if s.stability.is_finite() && s.stability >= 0.0 {
                s.stability
            } else {
                default_stability as f32
            };
            let diff = if s.difficulty.is_finite() && s.difficulty >= 0.0 {
                s.difficulty
            } else {
                default_difficulty as f32
            };
            (stab, diff)
        }
        None => (default_stability as f32, default_difficulty as f32),
    };

    FsrsCard {
        stability,
        difficulty,
        scheduled_days: last_scheduled_days,
        reps,
        lapses,
        last_rating,
    }
}

/// Возвращает извлекаемость для заданного состояния и числа прошедших дней
pub fn get_retrievability(state: MemoryState, days_elapsed: u32) -> f32 {
    fsrs_schedule::current_retrievability(state, days_elapsed as f32)
}

/// Вычисляет MemoryState из FsrsCard для последующего next_states
pub fn memory_state_from_card(card: &FsrsCard) -> Option<MemoryState> {
    if card.reps == 0 {
        None
    } else {
        Some(MemoryState {
            stability: card.stability,
            difficulty: card.difficulty,
        })
    }
}

/// Определяет метку состояния для FsrsCard
pub fn card_state_label(card: &FsrsCard) -> &'static str {
    state_label(card.reps as usize, card.stability, card.last_rating)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_params() -> FsrsParameters {
        FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 365.0,
            w: fsrs_schedule::DEFAULT_PARAMETERS,
        }
    }

    fn review(date: &str, rating: u8) -> ReviewSession {
        ReviewSession {
            date: date.to_string(),
            rating,
        }
    }

    #[test]
    fn test_empty_reviews() {
        let card = compute_card_from_reviews(&[], 2.5, 5.0, &test_params());
        assert_eq!(card.reps, 0);
        assert_eq!(card.lapses, 0);
        assert_eq!(card.stability, 2.5);
        assert_eq!(card.difficulty, 5.0);
        assert_eq!(card_state_label(&card), "New");
    }

    #[test]
    fn test_single_good() {
        let reviews = vec![review("2026-01-01T10:00:00Z", 2)];
        let card = compute_card_from_reviews(&reviews, 2.5, 5.0, &test_params());
        assert_eq!(card.reps, 1);
        assert_eq!(card.lapses, 0);
        assert!(card.stability > 0.0);
        assert!(card.difficulty > 0.0);
        assert!(card.last_rating == Some(3)); // Good = 3 в v6
        assert_ne!(card_state_label(&card), "New");
    }

    #[test]
    fn test_multiple_reviews() {
        let reviews = vec![
            review("2026-01-01T10:00:00Z", 0), // Again
            review("2026-01-02T10:00:00Z", 2), // Good
            review("2026-01-03T10:00:00Z", 3), // Easy
        ];
        let card = compute_card_from_reviews(&reviews, 2.5, 5.0, &test_params());
        assert_eq!(card.reps, 3);
        assert_eq!(card.lapses, 1); // Первый Again
        assert!(card.stability > 0.0);
    }

    #[test]
    fn test_state_labels() {
        // New
        let card = FsrsCard {
            stability: 0.0,
            difficulty: 0.0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            last_rating: None,
        };
        assert_eq!(card_state_label(&card), "New");

        // Review
        let card = FsrsCard {
            stability: 5.0,
            difficulty: 3.0,
            scheduled_days: 5,
            reps: 3,
            lapses: 0,
            last_rating: Some(3),
        };
        assert_eq!(card_state_label(&card), "Review");

        // Relearning
        let card = FsrsCard {
            stability: 1.0,
            difficulty: 7.0,
            scheduled_days: 1,
            reps: 2,
            lapses: 1,
            last_rating: Some(1),
        };
        assert_eq!(card_state_label(&card), "Relearning");
    }

    #[test]
    fn test_memory_state_from_new_card() {
        let card = FsrsCard {
            stability: 0.0,
            difficulty: 0.0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            last_rating: None,
        };
        assert!(memory_state_from_card(&card).is_none());
    }

    #[test]
    fn test_memory_state_from_reviewed_card() {
        let card = FsrsCard {
            stability: 3.0,
            difficulty: 5.0,
            scheduled_days: 3,
            reps: 1,
            lapses: 0,
            last_rating: Some(3),
        };
        let ms = memory_state_from_card(&card).unwrap();
        assert_eq!(ms.stability, 3.0);
        assert_eq!(ms.difficulty, 5.0);
    }
}
