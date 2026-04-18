//! Модуль валидации параметров таблицы FSRS
//! Проверяет корректность параметров, полученных из парсинга SQL-подобного синтаксиса

use log::{debug, warn};

use crate::table_processing::types::{TableParams, is_valid_table_field};

/// Типы предупреждений, обнаруженных при валидации
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseWarning {
    /// Неизвестное поле в SELECT
    UnknownField(String),
    /// Дублирующееся поле в SELECT
    DuplicateField(String),
    /// Некорректное значение LIMIT
    InvalidLimit(usize),
    /// Неизвестное поле для сортировки
    UnknownSortField(String),
    /// Неожиданный токен (для восстановления после ошибок)
    UnexpectedToken(String),
    /// Прочие предупреждения
    Other(String),
}

impl std::fmt::Display for ParseWarning {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseWarning::UnknownField(field) => write!(f, "Неизвестное поле: '{}'", field),
            ParseWarning::DuplicateField(field) => write!(f, "Дублирующееся поле: '{}'", field),
            ParseWarning::InvalidLimit(limit) => write!(f, "Некорректный LIMIT: {}", limit),
            ParseWarning::UnknownSortField(field) => write!(f, "Неизвестное поле для сортировки: '{}'", field),
            ParseWarning::UnexpectedToken(token) => write!(f, "Неожиданный токен: '{}'", token),
            ParseWarning::Other(msg) => write!(f, "{}", msg),
        }
    }
}

/// Результат валидации с предупреждениями
#[derive(Debug, Clone)]
pub struct ValidationResult {
    /// Предупреждения, обнаруженные во время валидации
    pub warnings: Vec<ParseWarning>,
}

impl ValidationResult {
    /// Создает новый результат валидации
    pub fn new(warnings: Vec<ParseWarning>) -> Self {
        Self { warnings }
    }


}

/// Валидирует параметры таблицы, полученные из парсинга
///
/// # Аргументы
/// * `params` - параметры таблицы для валидации
///
/// # Возвращает
/// Результат валидации с предупреждениями
///
/// # Пример
/// ```
/// use table_processing::parsing::validate_table_params;
/// use table_processing::types::TableParams;
///
/// let params = TableParams::default();
/// let result = validate_table_params(&params);
///
/// for warning in result.warnings {
///     println!("Предупреждение: {}", warning);
/// }
/// ```
pub fn validate_table_params(params: &TableParams) -> ValidationResult {
    let mut warnings = Vec::new();

    debug!("Начало валидации параметров таблицы");

    // Проверка колонок
    validate_columns(params, &mut warnings);

    // Проверка сортировки
    validate_sort_params(params, &mut warnings);

    // Проверка лимита
    validate_limit(params, &mut warnings);

    if warnings.is_empty() {
        debug!("Валидация параметров таблицы завершена без предупреждений");
    } else {
        warn!("Валидация параметров таблицы завершена с {} предупреждениями", warnings.len());
    }

    ValidationResult::new(warnings)
}

/// Валидирует колонки таблицы
fn validate_columns(params: &TableParams, warnings: &mut Vec<ParseWarning>) {
    let mut seen_fields = std::collections::HashSet::new();

    for column in &params.columns {
        // Проверка существования поля
        if !is_valid_table_field(&column.field) {
            warnings.push(ParseWarning::UnknownField(column.field.clone()));
            continue;
        }

        // Проверка на дублирование полей
        if !seen_fields.insert(&column.field) {
            warnings.push(ParseWarning::DuplicateField(column.field.clone()));
        }
    }

    // Проверка, что есть хотя бы одна валидная колонка
    if seen_fields.is_empty() && !params.columns.is_empty() {
        warn!("Нет валидных полей в SELECT. Будут использованы колонки по умолчанию.");
        warnings.push(ParseWarning::Other("Нет валидных полей в SELECT".to_string()));
    }
}

/// Валидирует параметры сортировки
fn validate_sort_params(params: &TableParams, warnings: &mut Vec<ParseWarning>) {
    if let Some(sort) = &params.sort {
        if !is_valid_table_field(&sort.field) {
            warnings.push(ParseWarning::UnknownSortField(sort.field.clone()));
        }

        // Дополнительная проверка: можно ли сортировать по этому полю
        // Некоторые поля могут не поддерживать сортировку (например, state требует специальной обработки)
        // Но пока просто проверяем существование поля
    }
}

/// Валидирует лимит
fn validate_limit(params: &TableParams, warnings: &mut Vec<ParseWarning>) {
    if params.limit == 0 {
        // 0 означает "использовать настройки" - это корректное значение
        return;
    }

    // Проверяем, что лимит имеет разумное значение
    // Максимальный лимит можно установить, например, 1000
    const MAX_LIMIT: usize = 1000;

    if params.limit > MAX_LIMIT {
        warn!("LIMIT {} превышает максимальное значение {}. Будет использовано {}",
              params.limit, MAX_LIMIT, MAX_LIMIT);
        warnings.push(ParseWarning::InvalidLimit(params.limit));
    }

    // Отрицательные значения уже отфильтрованы парсером
    // Но на всякий случай проверяем
    if params.limit == 0 {
        // Это уже обработано выше, но если вдруг пропустили
        warnings.push(ParseWarning::InvalidLimit(0));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table_processing::types::{TableColumn, SortDirection, SortParam, TableParams};

    #[test]
    fn test_parse_warning_display() {
        let warnings = vec![
            ParseWarning::UnknownField("unknown".to_string()),
            ParseWarning::DuplicateField("file".to_string()),
            ParseWarning::InvalidLimit(9999),
            ParseWarning::UnknownSortField("invalid".to_string()),
            ParseWarning::UnexpectedToken("@".to_string()),
            ParseWarning::Other("Тестовое предупреждение".to_string()),
        ];

        let displays: Vec<String> = warnings.iter().map(|w| w.to_string()).collect();

        assert!(displays[0].contains("Неизвестное поле"));
        assert!(displays[1].contains("Дублирующееся поле"));
        assert!(displays[2].contains("Некорректный LIMIT"));
        assert!(displays[3].contains("Неизвестное поле для сортировки"));
        assert!(displays[4].contains("Неожиданный токен"));
        assert!(displays[5].contains("Тестовое предупреждение"));
    }

    #[test]
    fn test_validation_result() {
        let result = ValidationResult::new(Vec::new());
        assert!(result.warnings.is_empty());

        let warnings = vec![ParseWarning::Other("test".to_string())];
        let result = ValidationResult::new(warnings);
        assert!(!result.warnings.is_empty());
    }

    #[test]
    fn test_validate_valid_params() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "Файл".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "reps".to_string(),
                    title: "Повторений".to_string(),
                    width: None,
                },
            ],
            limit: 10,
            sort: Some(SortParam {
                field: "due".to_string(),
                direction: SortDirection::Desc,
            }),
        };

        let result = validate_table_params(&params);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_validate_unknown_field() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "Файл".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "unknown_field".to_string(),
                    title: "Неизвестное".to_string(),
                    width: None,
                },
            ],
            limit: 10,
            sort: None,
        };

        let result = validate_table_params(&params);
        assert!(!result.warnings.is_empty());

        let has_unknown_field = result.warnings.iter()
            .any(|w| matches!(w, ParseWarning::UnknownField(f) if f == "unknown_field"));
        assert!(has_unknown_field);
    }

    #[test]
    fn test_validate_duplicate_field() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "Файл".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "reps".to_string(),
                    title: "Повторений".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "file".to_string(), // Дубликат
                    title: "Файл 2".to_string(),
                    width: None,
                },
            ],
            limit: 10,
            sort: None,
        };

        let result = validate_table_params(&params);
        assert!(!result.warnings.is_empty());

        let has_duplicate = result.warnings.iter()
            .any(|w| matches!(w, ParseWarning::DuplicateField(f) if f == "file"));
        assert!(has_duplicate);
    }

    #[test]
    fn test_validate_unknown_sort_field() {
        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "Файл".to_string(),
                width: None,
            }],
            limit: 10,
            sort: Some(SortParam {
                field: "unknown_field".to_string(),
                direction: SortDirection::Asc,
            }),
        };

        let result = validate_table_params(&params);
        assert!(!result.warnings.is_empty());

        let has_unknown_sort = result.warnings.iter()
            .any(|w| matches!(w, ParseWarning::UnknownSortField(f) if f == "unknown_field"));
        assert!(has_unknown_sort);
    }

    #[test]
    fn test_validate_large_limit() {
        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "Файл".to_string(),
                width: None,
            }],
            limit: 9999, // Превышает максимальный лимит
            sort: None,
        };

        let result = validate_table_params(&params);
        assert!(!result.warnings.is_empty());

        let has_invalid_limit = result.warnings.iter()
            .any(|w| matches!(w, ParseWarning::InvalidLimit(9999)));
        assert!(has_invalid_limit);
    }

    #[test]
    fn test_validate_limit_zero() {
        // LIMIT 0 - это корректное значение (использовать настройки)
        let params = TableParams {
            columns: vec![TableColumn {
                field: "file".to_string(),
                title: "Файл".to_string(),
                width: None,
            }],
            limit: 0,
            sort: None,
        };

        let result = validate_table_params(&params);
        // Нет предупреждений для limit = 0
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_validate_no_valid_columns() {
        // Все поля невалидны
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "invalid1".to_string(),
                    title: "Невалидное 1".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "invalid2".to_string(),
                    title: "Невалидное 2".to_string(),
                    width: None,
                },
            ],
            limit: 10,
            sort: None,
        };

        let result = validate_table_params(&params);
        assert!(!result.warnings.is_empty());

        // Должны быть предупреждения о неизвестных полях
        assert_eq!(result.warnings.len(), 3); // 2 unknown field + 1 "нет валидных полей"

        let has_no_valid_fields = result.warnings.iter()
            .any(|w| matches!(w, ParseWarning::Other(msg) if msg.contains("Нет валидных полей")));
        assert!(has_no_valid_fields);
    }

    #[test]
    fn test_validate_mixed_valid_invalid() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "Файл".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "invalid".to_string(),
                    title: "Невалидное".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "reps".to_string(),
                    title: "Повторений".to_string(),
                    width: None,
                },
                TableColumn {
                    field: "invalid".to_string(), // Дубликат невалидного поля
                    title: "Невалидное 2".to_string(),
                    width: None,
                },
            ],
            limit: 9999,
            sort: Some(SortParam {
                field: "unknown_sort".to_string(),
                direction: SortDirection::Desc,
            }),
        };

        let result = validate_table_params(&params);
        assert!(!result.warnings.is_empty());

        // Подсчитываем типы предупреждений
        let mut unknown_fields = 0;
        let mut duplicate_fields = 0;
        let mut invalid_limits = 0;
        let mut unknown_sort_fields = 0;

        for warning in &result.warnings {
            match warning {
                ParseWarning::UnknownField(_) => unknown_fields += 1,
                ParseWarning::DuplicateField(_) => duplicate_fields += 1,
                ParseWarning::InvalidLimit(_) => invalid_limits += 1,
                ParseWarning::UnknownSortField(_) => unknown_sort_fields += 1,
                _ => {}
            }
        }

        // Ожидаем: 2 unknown fields (invalid появляется дважды, но duplicate только для valid полей)
        // 1 duplicate field (invalid появляется дважды, но unknown приоритетнее)
        // 1 invalid limit
        // 1 unknown sort field

        assert_eq!(unknown_fields, 2); // invalid поле встречается 2 раза
        assert_eq!(duplicate_fields, 0); // duplicate только для valid полей, а invalid поля уже unknown
        assert_eq!(invalid_limits, 1);
        assert_eq!(unknown_sort_fields, 1);
    }
}
