use crate::types::{FsrsParameters, ReviewSession};

use rs_fsrs::{Card, State};
use chrono::{DateTime, Utc};

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
        let last_review: DateTime<Utc> = last_session.date.parse()
            .unwrap_or_else(|_| Utc::now());

        // Вычисляем reps и lapses на основе истории
        let mut reps = 0;
        let mut lapses = 0;
        let mut had_successful_review = false;

        for session in reviews {
            match session.rating.as_str() {
                "Again" => {
                    if had_successful_review {
                        lapses += 1;
                    }
                }
                _ => {
                    reps += 1;
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

        // Применяем случайное изменение интервала (fuzz) если включено
        if parameters.enable_fuzz {
            // Простая детерминированная вариация на основе timestamp
            let timestamp = last_review.timestamp() as u32;
            let variation = (timestamp % 100) as f64 / 1000.0; // 0.00 до 0.10
            interval_days *= 0.95 + variation; // ±5% вариация
        }

        // Вычисляем дату следующего повторения
        let due_date = last_review + chrono::Duration::days(interval_days as i64);

        // Создаем карточку с данными из последней сессии
        Card {
            stability: last_session.stability,
            difficulty: last_session.difficulty,
            elapsed_days: 0, // будет вычислено при следующем повторении
            scheduled_days: interval_days as i64,
            reps: reps as i32,
            lapses: lapses as i32,
            state: state,
            due: due_date,
            last_review: last_review,
        }
    }
}

/// Вспомогательная функция для вычисления интервала на основе стабильности и параметров
pub fn compute_interval(stability: f64, params: &FsrsParameters) -> f64 {
    let request_retention = params.request_retention;
    let base_interval = if request_retention > 0.0 && request_retention <= 1.0 {
        (stability * request_retention.ln() / 0.9f64.ln()).max(1.0)
    } else {
        stability.max(1.0)
    };

    let mut interval = base_interval.min(params.maximum_interval);

    // Применяем fuzz если включено
    if params.enable_fuzz {
        // Используем текущее время как детерминированный seed
        let timestamp = Utc::now().timestamp() as u32;
        let variation = (timestamp % 100) as f64 / 1000.0; // 0.00 до 0.10
        interval *= 0.95 + variation; // ±5% вариация
    }

    interval
}

/// Вычисляет reps и lapses на основе истории сессий
pub fn compute_stats_from_history(reviews: &[ReviewSession]) -> (i32, i32) {
    let mut reps = 0;
    let mut lapses = 0;
    let mut had_successful_review = false;

    for session in reviews {
        match session.rating.as_str() {
            "Again" => {
                if had_successful_review {
                    lapses += 1;
                }
            }
            _ => {
                reps += 1;
                had_successful_review = true;
            }
        }
    }

    (reps as i32, lapses as i32)
}

/// Определяет состояние карточки на основе стабильности
pub fn determine_state_from_stability(stability: f64) -> State {
    if stability < 1.0 {
        State::Learning
    } else {
        State::Review
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

    fn create_test_review_session(date_str: &str, rating: &str, stability: f64, difficulty: f64) -> ReviewSession {
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

        let card = create_card_from_last_session(&[], default_stability, default_difficulty, &params);

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
        let reviews = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Good", 5.0, 3.0)
        ];

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
        // reps: Good и Easy (2), lapses: 0 (Again был первым, до успешного повторения)
        assert_eq!(card.reps, 2);
        assert_eq!(card.lapses, 0);
        assert_eq!(card.state, State::Review); // stability >= 1.0
    }

    #[test]
    fn test_create_card_from_last_session_learning_state() {
        let params = create_test_parameters();
        let reviews = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Again", 0.8, 7.0),
        ];

        let card = create_card_from_last_session(&reviews, 2.5, 5.0, &params);

        assert_eq!(card.stability, 0.8);
        assert_eq!(card.state, State::Learning); // stability < 1.0
    }

    #[test]
    fn test_create_card_from_last_session_with_invalid_date() {
        let params = create_test_parameters();
        let reviews = vec![
            ReviewSession {
                date: "invalid date".to_string(),
                rating: "Good".to_string(),
                stability: 5.0,
                difficulty: 3.0,
            }
        ];

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
    fn test_compute_interval_basic() {
        let params = FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 365.0,
            enable_fuzz: false,
        };

        // При стабильности 10 и retention 0.9
        let interval = compute_interval(10.0, &params);
        let expected = (10.0 * 0.9f64.ln() / 0.9f64.ln()).max(1.0).min(365.0);
        assert_eq!(interval, expected);

        // Маленькая стабильность
        let interval_small = compute_interval(0.5, &params);
        assert_eq!(interval_small, 1.0); // min 1.0

        // Очень большая стабильность ограничивается maximum_interval
        let interval_large = compute_interval(1000.0, &params);
        assert_eq!(interval_large, 365.0);
    }

    #[test]
    fn test_compute_interval_with_fuzz() {
        let params_with_fuzz = FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 365.0,
            enable_fuzz: true,
        };

        let params_without_fuzz = FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 365.0,
            enable_fuzz: false,
        };

        let stability = 10.0;
        let interval_with_fuzz = compute_interval(stability, &params_with_fuzz);
        let interval_without_fuzz = compute_interval(stability, &params_without_fuzz);

        // С fuzz интервал должен отличаться от базового (вариация ±5%)
        // Но так как мы используем текущее время как seed, мы просто проверяем,
        // что функция не падает и возвращает положительное значение
        assert!(interval_with_fuzz > 0.0);
        assert!(interval_without_fuzz > 0.0);
    }

    #[test]
    fn test_compute_interval_edge_cases() {
        let params = FsrsParameters {
            request_retention: 0.0, // Некорректное значение
            maximum_interval: 100.0,
            enable_fuzz: false,
        };

        // При request_retention <= 0.0 используется просто stability
        let interval = compute_interval(5.0, &params);
        assert_eq!(interval, 5.0);

        // Проверка с request_retention > 1.0
        let params_invalid_retention = FsrsParameters {
            request_retention: 1.5,
            maximum_interval: 100.0,
            enable_fuzz: false,
        };

        let interval_invalid = compute_interval(5.0, &params_invalid_retention);
        assert_eq!(interval_invalid, 5.0); // Просто stability
    }

    #[test]
    fn test_compute_stats_from_history() {
        // Тест 1: Только успешные повторения
        let reviews1 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Good", 5.0, 3.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Easy", 8.0, 2.0),
        ];

        let (reps1, lapses1) = compute_stats_from_history(&reviews1);
        assert_eq!(reps1, 2);
        assert_eq!(lapses1, 0);

        // Тест 2: Сначала неудача, потом успехи
        let reviews2 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Good", 2.0, 5.0),
            create_test_review_session("2025-01-03T10:00:00Z", "Again", 1.0, 6.0),
        ];

        let (reps2, lapses2) = compute_stats_from_history(&reviews2);
        // reps: Good (1), lapses: Again после первого успешного повторения (1)
        assert_eq!(reps2, 1);
        assert_eq!(lapses2, 1);

        // Тест 3: Все неудачи
        let reviews3 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Again", 0.5, 8.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Again", 0.3, 9.0),
        ];

        let (reps3, lapses3) = compute_stats_from_history(&reviews3);
        assert_eq!(reps3, 0);
        assert_eq!(lapses3, 0); // Не было успешных повторений до этого

        // Тест 4: Смешанная история
        let reviews4 = vec![
            create_test_review_session("2025-01-01T10:00:00Z", "Hard", 1.0, 7.0),
            create_test_review_session("2025-01-02T10:00:00Z", "Again", 0.8, 8.0),
            create_test_review_session("2025-01-03T10:00:00Z", "Good", 2.0, 5.0),
            create_test_review_session("2025-01-04T10:00:00Z", "Again", 1.5, 6.0),
            create_test_review_session("2025-01-05T10:00:00Z", "Easy", 4.0, 4.0),
        ];

        let (reps4, lapses4) = compute_stats_from_history(&reviews4);
        // reps: Hard, Good, Easy (3), lapses: Again после Hard, Again после Good (2)
        assert_eq!(reps4, 3);
        assert_eq!(lapses4, 2);
    }

    #[test]
    fn test_compute_stats_from_history_empty() {
        let (reps, lapses) = compute_stats_from_history(&[]);
        assert_eq!(reps, 0);
        assert_eq!(lapses, 0);
    }

    #[test]
    fn test_determine_state_from_stability() {
        // Стабильность меньше 1.0 -> Learning
        assert_eq!(determine_state_from_stability(0.0), State::Learning);
        assert_eq!(determine_state_from_stability(0.5), State::Learning);
        assert_eq!(determine_state_from_stability(0.999), State::Learning);

        // Стабильность 1.0 или больше -> Review
        assert_eq!(determine_state_from_stability(1.0), State::Review);
        assert_eq!(determine_state_from_stability(1.5), State::Review);
        assert_eq!(determine_state_from_stability(100.0), State::Review);

        // Отрицательная стабильность (не должно быть в реальности, но обрабатываем)
        assert_eq!(determine_state_from_stability(-1.0), State::Learning);
    }

    #[test]
    fn test_determine_state_from_stability_boundary() {
        // Граничное значение
        assert_eq!(determine_state_from_stability(0.999999), State::Learning);
        assert_eq!(determine_state_from_stability(1.000001), State::Review);
    }
}
