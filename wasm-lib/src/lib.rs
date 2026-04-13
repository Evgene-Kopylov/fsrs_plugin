use wasm_bindgen::prelude::*;
use rs_fsrs::{Card, FSRS, Parameters, Rating, State};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};


// Структуры для нового формата с reviews

/// Сессия повторения карточки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSession {
    pub date: String,        // ISO 8601 строка
    pub rating: String,      // "Again", "Hard", "Good", "Easy"
    pub stability: f64,
    pub difficulty: f64,
}

/// Современная карточка FSRS с reviews
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModernFsrsCard {
    pub srs: bool,
    pub reviews: Vec<ReviewSession>,
}

/// Параметры алгоритма FSRS из настроек плагина
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsrsParameters {
    pub request_retention: f64,
    pub maximum_interval: f64,
    pub enable_fuzz: bool,
}

/// Результат вычисления текущего состояния
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputedState {
    pub due: String,           // следующая дата повторения (ISO 8601)
    pub stability: f64,
    pub difficulty: f64,
    pub state: String,         // "New", "Learning", "Review", "Relearning"
    pub elapsed_days: u64,
    pub scheduled_days: u64,
    pub reps: u64,
    pub lapses: u64,
    pub retrievability: f64,
}

/// Конвертирует строковый рейтинг в Rating enum
fn rating_from_str(rating: &str) -> Rating {
    match rating {
        "Again" => Rating::Again,
        "Hard" => Rating::Hard,
        "Good" => Rating::Good,
        "Easy" => Rating::Easy,
        _ => Rating::Good,
    }
}

/// Конвертирует Rating enum в строку
fn rating_to_string(rating: Rating) -> String {
    match rating {
        Rating::Again => "Again".to_string(),
        Rating::Hard => "Hard".to_string(),
        Rating::Good => "Good".to_string(),
        Rating::Easy => "Easy".to_string(),
    }
}

/// Конвертирует State enum в строку
fn state_to_string(state: State) -> String {
    match state {
        State::New => "New".to_string(),
        State::Learning => "Learning".to_string(),
        State::Review => "Review".to_string(),
        State::Relearning => "Relearning".to_string(),
    }
}

/// Создает Parameters для FSRS из пользовательских параметров
fn create_fsrs_parameters(params: &FsrsParameters) -> Parameters {
    let mut default_params = Parameters::default();
    default_params.request_retention = params.request_retention;
    default_params.maximum_interval = params.maximum_interval as i32;
    default_params.enable_fuzz = params.enable_fuzz;
    default_params
}

/// Создает Card из истории reviews
fn create_card_from_last_session(
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

// Функция для получения YAML строки для новой карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml() -> String {
    let card = ModernFsrsCard {
        srs: true,
        reviews: Vec::new(),
    };

    // Сериализуем в YAML
    let yaml = serde_yaml::to_string(&card)
        .unwrap_or_else(|_| "srs: true\nreviews: []".to_string());

    yaml
}

// Функция для обновления карточки FSRS на основе оценки
#[wasm_bindgen]
pub fn review_card(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим карточку из JSON
    let mut card: ModernFsrsCard = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| {
            // Если не удалось распарсить, создаем новую карточку
            ModernFsrsCard {
                srs: true,
                reviews: Vec::new(),
            }
        });

    // Парсим параметры алгоритма
    let parameters: FsrsParameters = serde_json::from_str(&parameters_json)
        .unwrap_or_else(|_| {
            // Дефолтные параметры
            FsrsParameters {
                request_retention: 0.9,
                maximum_interval: 36500.0,
                enable_fuzz: true,
            }
        });

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| Utc::now());

    // Конвертируем рейтинг
    let rating = rating_from_str(&rating_str);

    // Создаем Card для алгоритма FSRS из истории reviews
    let mut fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Получаем последнюю сессию (если есть)
    let last_session = card.reviews.last();

    // Если есть последняя сессия, обновляем elapsed_days
    if let Some(last_session) = last_session {
        if let Ok(last_date) = last_session.date.parse::<DateTime<Utc>>() {
            let elapsed_days = (now - last_date).num_days().max(0) as i64;
            fsrs_card.elapsed_days = elapsed_days;
        }
    }

    // Создаем экземпляр FSRS с пользовательскими параметрами
    let fsrs_params = create_fsrs_parameters(&parameters);
    let fsrs = FSRS::new(fsrs_params);

    // Получаем результат повторения карточки
    let scheduling_info = fsrs.next(fsrs_card, now, rating);
    let updated_card = scheduling_info.card;

    // Создаем новую сессию
    let new_session = ReviewSession {
        date: now.to_rfc3339(),
        rating: rating_to_string(rating),
        stability: updated_card.stability,
        difficulty: updated_card.difficulty,
    };

    // Добавляем сессию в карточку
    card.reviews.push(new_session);
    card.srs = true;

    // Возвращаем обновленную карточку в формате JSON
    serde_json::to_string(&card)
        .unwrap_or_else(|_| "{\"srs\": true, \"reviews\": []}".to_string())
}

// Функция для получения YAML строки после повторения карточки
#[wasm_bindgen]
pub fn get_fsrs_yaml_after_review(
    card_json: String,
    rating_str: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Обновляем карточку
    let updated_card_json = review_card(
        card_json,
        rating_str,
        now_str,
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим обновленную карточку
    let card: ModernFsrsCard = serde_json::from_str(&updated_card_json)
        .unwrap_or_else(|_| {
            ModernFsrsCard {
                srs: true,
                reviews: Vec::new(),
            }
        });

    // Сериализуем в YAML
    serde_yaml::to_string(&card)
        .unwrap_or_else(|_| "srs: true\nreviews: []".to_string())
}

// Функция для вычисления текущего состояния карточки
#[wasm_bindgen]
pub fn compute_current_state(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим карточку из JSON
    let card: ModernFsrsCard = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| {
            ModernFsrsCard {
                srs: true,
                reviews: Vec::new(),
            }
        });

    // Парсим параметры алгоритма
    let parameters: FsrsParameters = serde_json::from_str(&parameters_json)
        .unwrap_or_else(|_| {
            FsrsParameters {
                request_retention: 0.9,
                maximum_interval: 36500.0,
                enable_fuzz: true,
            }
        });

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| Utc::now());

    // Создаем Card для алгоритма FSRS из истории reviews
    let mut fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Получаем последнюю сессию (если есть)
    let last_session = card.reviews.last();

    // Если есть последняя сессия, обновляем elapsed_days
    if let Some(last_session) = last_session {
        if let Ok(last_date) = last_session.date.parse::<DateTime<Utc>>() {
            let elapsed_days = (now - last_date).num_days().max(0) as i64;
            fsrs_card.elapsed_days = elapsed_days;
            fsrs_card.last_review = last_date;

            // Рассчитываем извлекаемость
            let retrievability = fsrs_card.get_retrievability(now);

            // Проверяем, просрочена ли карточка
            let _is_due = fsrs_card.due <= now;

            // Создаем вычисляемое состояние
            let computed_state = ComputedState {
                due: fsrs_card.due.to_rfc3339(),
                stability: fsrs_card.stability,
                difficulty: fsrs_card.difficulty,
                state: state_to_string(fsrs_card.state),
                elapsed_days: fsrs_card.elapsed_days as u64,
                scheduled_days: fsrs_card.scheduled_days as u64,
                reps: fsrs_card.reps as u64,
                lapses: fsrs_card.lapses as u64,
                retrievability,
            };

            return serde_json::to_string(&computed_state)
                .unwrap_or_else(|_| "{}".to_string());
        }
    }

    // Если нет сессий, возвращаем дефолтное состояние
    let computed_state = ComputedState {
        due: now.to_rfc3339(),
        stability: default_stability,
        difficulty: default_difficulty,
        state: "New".to_string(),
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        retrievability: 1.0,
    };

    serde_json::to_string(&computed_state)
        .unwrap_or_else(|_| "{}".to_string())
}

// Функция для получения всех возможных следующих дат повторения
#[wasm_bindgen]
pub fn get_next_review_dates(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Парсим карточку из JSON
    let card: ModernFsrsCard = serde_json::from_str(&card_json)
        .unwrap_or_else(|_| {
            ModernFsrsCard {
                srs: true,
                reviews: Vec::new(),
            }
        });

    // Парсим параметры алгоритма
    let parameters: FsrsParameters = serde_json::from_str(&parameters_json)
        .unwrap_or_else(|_| {
            FsrsParameters {
                request_retention: 0.9,
                maximum_interval: 36500.0,
                enable_fuzz: true,
            }
        });

    // Парсим текущее время
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| Utc::now());

    // Создаем Card для алгоритма FSRS из истории reviews
    let fsrs_card = create_card_from_last_session(
        &card.reviews,
        default_stability,
        default_difficulty,
        &parameters,
    );

    // Создаем экземпляр FSRS с пользовательскими параметрами
    let fsrs_params = create_fsrs_parameters(&parameters);
    let fsrs = FSRS::new(fsrs_params);

    // Получаем все возможные результаты для разных оценок
    let record_log = fsrs.repeat(fsrs_card, now);

    // Создаем структуру для результата
    #[derive(Serialize)]
    struct NextReviewDates {
        again: Option<String>,
        hard: Option<String>,
        good: Option<String>,
        easy: Option<String>,
    }

    let mut result = NextReviewDates {
        again: None,
        hard: None,
        good: None,
        easy: None,
    };

    // Заполняем результат
    if let Some(scheduling_info) = record_log.get(&Rating::Again) {
        result.again = Some(scheduling_info.card.due.to_rfc3339());
    }

    if let Some(scheduling_info) = record_log.get(&Rating::Hard) {
        result.hard = Some(scheduling_info.card.due.to_rfc3339());
    }

    if let Some(scheduling_info) = record_log.get(&Rating::Good) {
        result.good = Some(scheduling_info.card.due.to_rfc3339());
    }

    if let Some(scheduling_info) = record_log.get(&Rating::Easy) {
        result.easy = Some(scheduling_info.card.due.to_rfc3339());
    }

    // Возвращаем результат в формате JSON
    serde_json::to_string(&result)
        .unwrap_or_else(|_| "{}".to_string())
}

// Функция для проверки, готова ли карточка к повторению
#[wasm_bindgen]
pub fn is_card_due(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Вычисляем текущее состояние
    let state_json = compute_current_state(
        card_json,
        now_str.clone(),
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим состояние
    let state: ComputedState = serde_json::from_str(&state_json)
        .unwrap_or_else(|_| {
            ComputedState {
                due: Utc::now().to_rfc3339(),
                stability: 0.0,
                difficulty: 0.0,
                state: "New".to_string(),
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                retrievability: 1.0,
            }
        });

    // Проверяем, просрочена ли карточка
    let due_date: DateTime<Utc> = state.due.parse()
        .unwrap_or_else(|_| Utc::now());
    let now: DateTime<Utc> = now_str.parse()
        .unwrap_or_else(|_| Utc::now());

    let is_due = due_date <= now;

    // Возвращаем результат в формате JSON
    serde_json::to_string(&is_due)
        .unwrap_or_else(|_| "false".to_string())
}

// Функция для получения извлекаемости (retrievability) карточки
#[wasm_bindgen]
pub fn get_retrievability(
    card_json: String,
    now_str: String,
    parameters_json: String,
    default_stability: f64,
    default_difficulty: f64,
) -> String {
    // Вычисляем текущее состояние
    let state_json = compute_current_state(
        card_json,
        now_str.clone(),
        parameters_json,
        default_stability,
        default_difficulty,
    );

    // Парсим состояние
    let state: ComputedState = serde_json::from_str(&state_json)
        .unwrap_or_else(|_| {
            ComputedState {
                due: Utc::now().to_rfc3339(),
                stability: 0.0,
                difficulty: 0.0,
                state: "New".to_string(),
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                retrievability: 1.0,
            }
        });

    // Возвращаем извлекаемость в формате JSON
    serde_json::to_string(&state.retrievability)
        .unwrap_or_else(|_| "1.0".to_string())
}

// Функция для получения текущего времени в формате ISO 8601
#[wasm_bindgen]
pub fn get_current_time() -> String {
    Utc::now().to_rfc3339()
}

// Оригинальная функция для обратной совместимости
#[wasm_bindgen]
pub fn my_wasm_function(input: String) -> String {
    format!("Hello from Rust with FSRS! Your input: {}", input)
}
