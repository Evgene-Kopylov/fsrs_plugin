//! Типы данных для обработки таблиц FSRS
//! Структуры для парсинга SQL-подобного синтаксиса блоков `fsrs-table`

use super::parsing::Expression;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Колонка таблицы с полем и заголовком
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableColumn {
    /// Идентификатор поля (file, reps, stability, и т.д.)
    pub field: String,
    /// Заголовок колонки для отображения
    pub title: String,
    /// Ширина колонки (опционально)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<String>,
    /// Формат даты для date_format (опционально, например "%Y-%m-%d")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_format: Option<String>,
}

/// Направление сортировки
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SortDirection {
    /// По возрастанию
    #[serde(rename = "ASC")]
    Asc,
    /// По убыванию
    #[serde(rename = "DESC")]
    Desc,
}

/// Параметры сортировки
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortParam {
    /// Поле для сортировки
    pub field: String,
    /// Направление сортировки
    pub direction: SortDirection,
}

/// Параметры таблицы, полученные из парсинга SQL-подобного синтаксиса
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableParams {
    /// Список колонок для отображения
    pub columns: Vec<TableColumn>,
    /// Ограничение количества строк (0 = использовать настройки)
    pub limit: usize,
    /// Параметры сортировки (опционально)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<SortParam>,
    /// Условие фильтрации WHERE (опционально)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub where_condition: Option<Expression>,
}

impl Default for TableParams {
    fn default() -> Self {
        Self {
            columns: default_columns(),
            limit: 0,
            sort: None,
            where_condition: None,
        }
    }
}

/// Псевдонимы полей (сокращение → полное имя)
/// Используются для упрощения ручного написания SQL-запросов
pub static FIELD_ALIASES: [(&str, &str); 3] = [
    ("d", "difficulty"),
    ("s", "stability"),
    ("r", "retrievability"),
];

/// Доступные поля для отображения в таблице
pub static AVAILABLE_FIELDS: [&str; 9] = [
    "file",
    "reps",
    "stability",
    "difficulty",
    "retrievability",
    "due",
    "state",
    "elapsed",
    "scheduled",
];

/// Разрешает псевдоним поля в полное имя.
/// Если переданное имя не является псевдонимом, возвращается как есть.
pub fn resolve_field_alias(field: &str) -> &str {
    for &(alias, full) in &FIELD_ALIASES {
        if field == alias {
            return full;
        }
    }
    field
}

/// Колонки по умолчанию при отсутствии SELECT в запросе
/// Возвращает одну колонку с полем file
pub fn default_columns() -> Vec<TableColumn> {
    vec![TableColumn {
        field: "file".to_string(),
        title: "file".to_string(),
        width: None,
        date_format: None,
    }]
}

/// Проверяет, является ли поле (или его псевдоним) допустимым для использования в таблице
pub fn is_valid_table_field(field: &str) -> bool {
    let resolved = resolve_field_alias(field);
    HashSet::from(AVAILABLE_FIELDS).contains(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_table_field() {
        assert!(is_valid_table_field("file"));
        assert!(is_valid_table_field("reps"));
        assert!(is_valid_table_field("stability"));
        assert!(!is_valid_table_field("unknown_field"));
    }

    #[test]
    fn test_field_aliases() {
        assert_eq!(resolve_field_alias("d"), "difficulty");
        assert_eq!(resolve_field_alias("s"), "stability");
        assert_eq!(resolve_field_alias("r"), "retrievability");
        // Не псевдоним — возвращается как есть
        assert_eq!(resolve_field_alias("file"), "file");
        assert_eq!(resolve_field_alias("unknown"), "unknown");
    }

    #[test]
    fn test_is_valid_table_field_with_aliases() {
        assert!(is_valid_table_field("d"));
        assert!(is_valid_table_field("s"));
        assert!(is_valid_table_field("r"));
    }

    #[test]
    fn test_sort_direction_serialization() {
        let asc = SortDirection::Asc;
        let desc = SortDirection::Desc;

        let asc_json = serde_json::to_string(&asc).unwrap();
        let desc_json = serde_json::to_string(&desc).unwrap();

        assert_eq!(asc_json, "\"ASC\"");
        assert_eq!(desc_json, "\"DESC\"");
    }

    #[test]
    fn test_table_params_serialization() {
        let params = TableParams {
            columns: vec![
                TableColumn {
                    field: "file".to_string(),
                    title: "file".to_string(),
                    width: None,
                    date_format: None,
                },
                TableColumn {
                    field: "reps".to_string(),
                    title: "reps".to_string(),
                    width: None,
                    date_format: None,
                },
            ],
            limit: 10,
            sort: Some(SortParam {
                field: "due".to_string(),
                direction: SortDirection::Desc,
            }),
            where_condition: None,
        };

        let json = serde_json::to_string(&params).unwrap();
        let parsed: TableParams = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.columns.len(), 2);
        assert_eq!(parsed.limit, 10);
        assert_eq!(parsed.sort.unwrap().field, "due");
    }
}
