// Scheduling-логика FSRS v6 — вычислительные формулы (без burn/оптимизатора).
//
// Источник: https://github.com/open-spaced-repetition/fsrs-rs (rev af8448e)
// Адаптировано: удалена зависимость burn, оставлены только f32-формулы.

/// Константы FSRS v6
pub const DEFAULT_PARAMETERS: [f32; 21] = [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

pub const FSRS6_DEFAULT_DECAY: f32 = 0.1542;

const S_MIN: f32 = 0.01;
const S_MAX: f32 = 36500.0;
const D_MIN: f32 = 1.0;
const D_MAX: f32 = 10.0;

/// Состояние памяти карточки
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MemoryState {
    pub stability: f32,
    pub difficulty: f32,
}

/// Результат планирования для одной кнопки
#[derive(Debug, Clone, PartialEq)]
pub struct ItemState {
    pub memory: MemoryState,
    pub interval: f32,
}

/// Следующие состояния для всех четырёх рейтингов
#[derive(Debug, Clone, PartialEq)]
pub struct NextStates {
    pub again: ItemState,
    pub hard: ItemState,
    pub good: ItemState,
    pub easy: ItemState,
}

// ─── Приватные вычислительные функции ───────────────────────────────

#[inline]
fn power_forgetting_curve(t: f32, s: f32, w: &[f32; 21]) -> f32 {
    let decay = -w[20];
    let factor = (0.9_f32.ln() / decay).exp() - 1.0;
    (t / s * factor + 1.0).powf(decay)
}

#[inline]
fn init_stability(rating: u32, w: &[f32; 21]) -> f32 {
    w[(rating - 1) as usize]
}

#[inline]
fn init_difficulty(rating: u32, w: &[f32; 21]) -> f32 {
    w[4] - ((rating as f32 - 1.0) * w[5]).exp() + 1.0
}

#[inline]
fn linear_damping(delta_d: f32, old_d: f32) -> f32 {
    (-old_d + 10.0) * delta_d / 9.0
}

#[inline]
fn next_difficulty(difficulty: f32, rating: u32, w: &[f32; 21]) -> f32 {
    let delta_d = -w[6] * (rating as f32 - 3.0);
    difficulty + linear_damping(delta_d, difficulty)
}

#[inline]
fn mean_reversion(new_d: f32, w: &[f32; 21]) -> f32 {
    let rating4_d = init_difficulty(4, w);
    w[7] * (rating4_d - new_d) + new_d
}

fn stability_after_success(last_s: f32, last_d: f32, r: f32, rating: u32, w: &[f32; 21]) -> f32 {
    let hard_penalty = if rating == 2 { w[15] } else { 1.0 };
    let easy_bonus = if rating == 4 { w[16] } else { 1.0 };

    last_s
        * (w[8].exp()
            * (-last_d + 11.0)
            * last_s.powf(-w[9])
            * (((-r + 1.0) * w[10]).exp() - 1.0)
            * hard_penalty
            * easy_bonus
            + 1.0)
}

fn stability_after_failure(last_s: f32, last_d: f32, r: f32, w: &[f32; 21]) -> f32 {
    let new_s = w[11]
        * last_d.powf(-w[12])
        * ((last_s + 1.0).powf(w[13]) - 1.0)
        * ((-r + 1.0) * w[14]).exp();
    let new_s_min = last_s / (w[17] * w[18]).exp();
    new_s.min(new_s_min)
}

#[inline]
fn stability_short_term(last_s: f32, rating: u32, w: &[f32; 21]) -> f32 {
    let sinc = (w[17] * (rating as f32 - 3.0 + w[18])).exp() * last_s.powf(-w[19]);
    if rating >= 3 {
        last_s * sinc.max(1.0)
    } else {
        last_s * sinc
    }
}

/// Вычисляет MemoryState после одного шага повторения
fn step(
    delta_t: u32,
    rating: u32,
    state: Option<MemoryState>,
    nth: usize,
    w: &[f32; 21],
) -> MemoryState {
    let (last_s, last_d) = match state {
        Some(s) => (
            s.stability.clamp(S_MIN, S_MAX),
            s.difficulty.clamp(D_MIN, D_MAX),
        ),
        None => (0.0, 0.0),
    };

    let delta_t_f = delta_t as f32;

    let retrievability = power_forgetting_curve(delta_t_f, last_s, w);
    let s_success = stability_after_success(last_s, last_d, retrievability, rating, w);
    let s_failure = stability_after_failure(last_s, last_d, retrievability, w);
    let s_short = stability_short_term(last_s, rating, w);

    let mut new_s = if rating == 1 { s_failure } else { s_success };
    if delta_t == 0 {
        new_s = s_short;
    }

    let mut new_d = next_difficulty(last_d, rating, w);
    new_d = mean_reversion(new_d, w).clamp(D_MIN, D_MAX);

    // Для новых карточек используем init_stability/init_difficulty
    if nth == 0 && last_s == 0.0 {
        let r = rating.clamp(1, 4);
        new_s = init_stability(r, w);
        new_d = init_difficulty(r, w).clamp(D_MIN, D_MAX);
    }

    // Рейтинг 0 — padding (не должен встречаться в нашем коде)
    if rating == 0 {
        new_s = last_s;
        new_d = last_d;
    }

    MemoryState {
        stability: new_s.clamp(S_MIN, S_MAX),
        difficulty: new_d,
    }
}

/// Вычисляет интервал для заданной стабильности
#[inline]
pub fn next_interval(stability: f32, desired_retention: f32, w: &[f32; 21]) -> f32 {
    let decay = -w[20];
    let factor = (0.9_f32.ln() / decay).exp() - 1.0;
    stability / factor * (desired_retention.powf(1.0 / decay) - 1.0)
}

// ─── Публичные функции ──────────────────────────────────────────────

/// Вычисляет следующие состояния для всех четырёх рейтингов
pub fn next_states(
    current_state: Option<MemoryState>,
    desired_retention: f32,
    days_elapsed: u32,
    w: &[f32; 21],
) -> NextStates {
    let nth = if current_state.is_some() { 1 } else { 0 };

    let again = step(days_elapsed, 1, current_state, nth, w);
    let hard = step(days_elapsed, 2, current_state, nth, w);
    let good = step(days_elapsed, 3, current_state, nth, w);
    let easy = step(days_elapsed, 4, current_state, nth, w);

    NextStates {
        again: ItemState {
            memory: again,
            interval: next_interval(again.stability, desired_retention, w),
        },
        hard: ItemState {
            memory: hard,
            interval: next_interval(hard.stability, desired_retention, w),
        },
        good: ItemState {
            memory: good,
            interval: next_interval(good.stability, desired_retention, w),
        },
        easy: ItemState {
            memory: easy,
            interval: next_interval(easy.stability, desired_retention, w),
        },
    }
}

/// Вычисляет извлекаемость (retrievability) на текущий момент
#[inline]
pub fn current_retrievability(state: MemoryState, days_elapsed: f32) -> f32 {
    let decay = FSRS6_DEFAULT_DECAY;
    let factor = 0.9_f32.powf(1.0 / -decay) - 1.0;
    (days_elapsed / state.stability * factor + 1.0).powf(-decay)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_retrievability() {
        let state = MemoryState {
            stability: 1.0,
            difficulty: 5.0,
        };
        assert!((current_retrievability(state, 0.0) - 1.0).abs() < 0.001);
        assert!((current_retrievability(state, 1.0) - 0.9).abs() < 0.001);
    }

    #[test]
    fn test_next_states_new_card() {
        let result = next_states(None, 0.9, 0, &DEFAULT_PARAMETERS);
        assert!(result.again.memory.stability > 0.0);
        assert!(result.good.memory.stability > 0.0);
        assert!(result.good.interval > 0.0);
        // Easy должен давать наибольший интервал
        assert!(result.easy.interval > result.good.interval);
        // Again должен давать наименьший интервал
        assert!(result.again.interval < result.good.interval);
    }

    #[test]
    fn test_next_states_existing_card() {
        let state = MemoryState {
            stability: 5.0,
            difficulty: 3.0,
        };
        let result = next_states(Some(state), 0.9, 1, &DEFAULT_PARAMETERS);
        assert!(result.good.memory.stability > state.stability);
        assert!(result.again.memory.stability < state.stability);
        assert!(result.good.interval > 1.0);
    }

    #[test]
    fn test_next_states_with_elapsed_days() {
        let state = MemoryState {
            stability: 10.0,
            difficulty: 5.0,
        };
        // С просрочкой в 5 дней
        let result = next_states(Some(state), 0.9, 5, &DEFAULT_PARAMETERS);
        assert!(result.good.memory.stability > 0.0);
        assert!(result.again.memory.stability > 0.0);
        // After lapse, stability drops
        assert!(result.again.memory.stability < result.good.memory.stability);
    }

    #[test]
    fn test_power_forgetting_curve() {
        let w = DEFAULT_PARAMETERS;
        let r0 = power_forgetting_curve(0.0, 1.0, &w);
        assert!((r0 - 1.0).abs() < 0.001);

        let r1 = power_forgetting_curve(1.0, 1.0, &w);
        assert!((r1 - 0.9).abs() < 0.001);

        // Чем больше дней, тем ниже извлекаемость
        let r2 = power_forgetting_curve(2.0, 1.0, &w);
        assert!(r2 < r1);
    }

    #[test]
    fn test_init_stability_and_difficulty() {
        let w = DEFAULT_PARAMETERS;
        // Rating 1 (Again) -> w[0]
        assert!((init_stability(1, &w) - w[0]).abs() < 0.001);
        // Rating 4 (Easy) -> w[3]
        assert!((init_stability(4, &w) - w[3]).abs() < 0.001);
        // Difficulty should decrease as rating increases
        assert!(init_difficulty(1, &w) > init_difficulty(4, &w));
    }

    #[test]
    fn test_next_interval() {
        let w = DEFAULT_PARAMETERS;
        let interval = next_interval(1.0, 0.9, &w);
        assert!(interval > 0.0);
        // Higher retention = shorter intervals
        let interval_95 = next_interval(1.0, 0.95, &w);
        assert!(interval_95 < interval);
    }
}
