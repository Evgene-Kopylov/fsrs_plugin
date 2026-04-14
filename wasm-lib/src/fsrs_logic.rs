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
