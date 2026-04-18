//! Типы данных для обработки таблиц FSRS
//! Структуры для парсинга SQL-подобного синтаксиса блоков `fsrs-table`

use std::collections::HashSet;
use serde::{Deserialize, Serialize};

/// Колонка таблицы с полем и заголовком
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableColumn {
    /// Идентификатор поля (file, reps, overdue, и т.д.)
    pub field: String,
    /// Заголовок колонки для отображения
    pub title: String,
    /// Ширина колонки (опционально)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<String>,
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
}

/// Доступные поля для отображения в таблице
pub static AVAILABLE_FIELDS: [&str; 10] = [
    "file",
    "reps",
    "overdue",
    "stability",
    "difficulty",
    "retrievability",
    "due",
    "state",
    "elapsed",
    "scheduled",
];

/// Колонки по умолчанию при отсутствии SELECT в запросе
pub fn default_columns() -> Vec<TableColumn> {
    vec![
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
            field: "overdue".to_string(),
            title: "Просрочка".to_string(),
            width: None,
        },
        TableColumn {
            field: "state".to_string(),
            title: "Состояние".to_string(),
            width: None,
        },
        TableColumn {
            field: "due".to_string(),
            title: "Следующее повторение".to_string(),
            width: None,
        },
    ]
}

/// Заголовок по умолчанию для поля
pub fn get_default_title(field: &str) -> String {
    match field {
        "file" => "Файл",
        "reps" => "Повторений",
        "overdue" => "Просрочка",
        "stability" => "Стабильность",
        "difficulty" => "Сложность",
        "retrievability" => "Извлекаемость",
        "due" => "Следующее повторение",
        "state" => "Состояние",
        "elapsed" => "Прошло дней",
        "scheduled" => "Запланировано дней",
        _ => field,
    }
    .to_string()
}

/// Проверяет, является ли поле допустимым для использования в таблице
pub fn is_valid_table_field(field: &str) -> bool {
    HashSet::from(AVAILABLE_FIELDS).contains(field)
}

/// Параметры таблицы по умолчанию
impl Default for TableParams {
    fn default() -> Self {
        Self {
            columns: default_columns(),
            limit: 0,
            sort: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_table_field() {
        assert!(is_valid_table_field("file"));
        assert!(is_valid_table_field("reps"));
        assert!(is_valid_table_field("overdue"));
        assert!(is_valid_table_field("stability"));
        assert!(!is_valid_table_field("unknown_field"));
    }

    #[test]
    fn test_get_default_title() {
        assert_eq!(get_default_title("file"), "Файл");
        assert_eq!(get_default_title("reps"), "Повторений");
        assert_eq!(get_default_title("overdue"), "Просрочка");
        assert_eq!(get_default_title("unknown"), "unknown");
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

        let json = serde_json::to_string(&params).unwrap();
        let parsed: TableParams = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.columns.len(), 2);
        assert_eq!(parsed.limit, 10);
        assert_eq!(parsed.sort.unwrap().field, "due");
    }

    #[test]
    fn test_default_columns() {
        let columns = default_columns();
        assert_eq!(columns.len(), 5);
        assert_eq!(columns[0].field, "file");
        assert_eq!(columns[0].title, "Файл");
    }
}
