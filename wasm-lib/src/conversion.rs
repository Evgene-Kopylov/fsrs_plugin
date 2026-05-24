/// Конвертирует числовой рейтинг из формата TS (0-3) в формат FSRS v6 (1-4)
/// TS: 0=Again, 1=Hard, 2=Good, 3=Easy
/// FSRS v6: 1=Again, 2=Hard, 3=Good, 4=Easy
pub fn rating_to_u32(rating: u8) -> u32 {
    (rating + 1) as u32
}

/// Эвристическое определение метки состояния карточки.
/// В FSRS v6 нет явного State enum — определяем по стабильности.
pub fn state_label(reviews_len: usize, stability: f32, last_rating: Option<u32>) -> &'static str {
    if reviews_len == 0 {
        "New"
    } else if last_rating == Some(1) {
        // Последний ответ — Again, карточка в переучивании
        "Relearning"
    } else if stability < 1.0 {
        "Learning"
    } else {
        "Review"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rating_to_u32() {
        assert_eq!(rating_to_u32(0), 1); // Again
        assert_eq!(rating_to_u32(1), 2); // Hard
        assert_eq!(rating_to_u32(2), 3); // Good
        assert_eq!(rating_to_u32(3), 4); // Easy
    }

    #[test]
    fn test_state_label() {
        assert_eq!(state_label(0, 0.0, None), "New");
        assert_eq!(state_label(1, 0.5, Some(3)), "Learning");
        assert_eq!(state_label(1, 2.0, Some(3)), "Review");
        assert_eq!(state_label(2, 10.0, Some(1)), "Relearning");
    }
}
