use crate::types::FsrsParameters;
use rs_fsrs::{Parameters, Rating, State};

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
    Parameters {
        request_retention: params.request_retention,
        maximum_interval: params.maximum_interval as i32,
        enable_fuzz: params.enable_fuzz,
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rs_fsrs::{Parameters, Rating, State};

    #[test]
    fn test_rating_from_str_valid() {
        assert_eq!(rating_from_str("Again"), Rating::Again);
        assert_eq!(rating_from_str("Hard"), Rating::Hard);
        assert_eq!(rating_from_str("Good"), Rating::Good);
        assert_eq!(rating_from_str("Easy"), Rating::Easy);
    }

    #[test]
    fn test_rating_from_str_invalid() {
        // Для некорректных строк возвращается Good как значение по умолчанию
        assert_eq!(rating_from_str(""), Rating::Good);
        assert_eq!(rating_from_str("Unknown"), Rating::Good);
        assert_eq!(rating_from_str("AGAIN"), Rating::Good); // чувствительность к регистру
    }

    #[test]
    fn test_state_to_string() {
        assert_eq!(state_to_string(State::New), "New");
        assert_eq!(state_to_string(State::Learning), "Learning");
        assert_eq!(state_to_string(State::Review), "Review");
        assert_eq!(state_to_string(State::Relearning), "Relearning");
    }

    #[test]
    fn test_create_fsrs_parameters() {
        let custom_params = FsrsParameters {
            request_retention: 0.85,
            maximum_interval: 365.0,
            enable_fuzz: false,
        };

        let fsrs_params = create_fsrs_parameters(&custom_params);

        // Проверяем, что пользовательские параметры установлены
        assert_eq!(fsrs_params.request_retention, 0.85);
        assert_eq!(fsrs_params.maximum_interval, 365);
        assert_eq!(fsrs_params.enable_fuzz, false);

        // Проверяем, что остальные параметры имеют значения по умолчанию
        let default_params = Parameters::default();
        assert_eq!(fsrs_params.w, default_params.w);
        assert_eq!(fsrs_params.decay, default_params.decay);
        assert_eq!(fsrs_params.factor, default_params.factor);
    }

    #[test]
    fn test_create_fsrs_parameters_with_fuzz_enabled() {
        let custom_params = FsrsParameters {
            request_retention: 0.9,
            maximum_interval: 1000.0,
            enable_fuzz: true,
        };

        let fsrs_params = create_fsrs_parameters(&custom_params);
        assert_eq!(fsrs_params.enable_fuzz, true);
        assert_eq!(fsrs_params.maximum_interval, 1000);
        assert_eq!(fsrs_params.request_retention, 0.9);
    }

    #[test]
    fn test_state_conversion_consistency() {
        // Проверяем, что каждое состояние имеет уникальное строковое представление
        let states = vec![
            State::New,
            State::Learning,
            State::Review,
            State::Relearning,
        ];
        let mut seen_strings = std::collections::HashSet::new();

        for state in states {
            let string_repr = state_to_string(state);
            assert!(
                !seen_strings.contains(&string_repr),
                "Duplicate string representation for state"
            );
            seen_strings.insert(string_repr);
        }
    }
}
