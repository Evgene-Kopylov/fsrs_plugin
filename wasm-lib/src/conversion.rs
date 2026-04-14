use crate::types::{FsrsParameters, ReviewSession};
use rs_fsrs::{Card, Parameters, Rating, State};
use chrono::{Utc};
use serde_json::{Result as JsonResult};

/// Конвертирует строковый рейтинг в Rating enum
pub fn rating_from_str(rating: &str) -> Rating {
    match rating {
        "Again" => Rating::Again,
        "Hard" => Rating::Hard,
        "Good" => Rating::Good,
        "Easy" => Rating::Easy,
        _ => Rating::Good,
    }
}

/// Конвертирует Rating enum в строку
pub fn rating_to_string(rating: Rating) -> String {
    match rating {
        Rating::Again => "Again".to_string(),
        Rating::Hard => "Hard".to_string(),
        Rating::Good => "Good".to_string(),
        Rating::Easy => "Easy".to_string(),
    }
}

/// Конвертирует State enum в строку
pub fn state_to_string(state: State) -> String {
    match state {
        State::New => "New".to_string(),
        State::Learning => "Learning".to_string(),
        State::Review => "Review".to_string(),
        State::Relearning => "Relearning".to_string(),
    }
}

/// Создает Parameters для FSRS из пользовательских параметров
pub fn create_fsrs_parameters(params: &FsrsParameters) -> Parameters {
    let mut default_params = Parameters::default();
    default_params.request_retention = params.request_retention;
    default_params.maximum_interval = params.maximum_interval as i32;
    default_params.enable_fuzz = params.enable_fuzz;
    default_params
}

/// Конвертирует сессию в JSON строку (вспомогательная функция)
pub fn session_to_json(session: &ReviewSession) -> JsonResult<String> {
    serde_json::to_string(session)
}

/// Конвертирует JSON строку в сессию (вспомогательная функция)
pub fn session_from_json(json_str: &str) -> JsonResult<ReviewSession> {
    serde_json::from_str(json_str)
}
