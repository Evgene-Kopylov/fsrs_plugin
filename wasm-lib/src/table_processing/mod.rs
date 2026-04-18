//! Модуль для обработки таблиц FSRS (парсинг, фильтрация, сортировка)
//! Включает SQL-подобный синтаксис для блоков `fsrs-table`

// Публичные модули
pub mod types;
pub mod parsing;
pub mod filtering;

// Реэкспорт основных типов для удобства использования
pub use types::{
    TableColumn,
    SortDirection,
    SortParam,
    TableParams,
};

// Реэкспорт функций парсинга
pub use parsing::parse_fsrs_table_block;

// Реэкспорт функций фильтрации и сортировки
pub use filtering::filter_and_sort_cards;
