/**
 * Главный файл с реэкспортами для блока fsrs-table с SQL-подобным синтаксисом
 * Отображает все карточки
 * Синтаксис: SELECT, ORDER BY, LIMIT
 */

// Реэкспорт типов и функций из модулей fsrs-table

// Типы и парсинг параметров
export type {
    TableColumn,
    TableParams,
    SortDirection,
    SortParam,
} from "./fsrs-table-params";
export { parseSqlBlock, AVAILABLE_FIELDS } from "./fsrs-table-params";

// Форматирование значений
export {
    formatOverdue,
    extractDisplayName,
    translateState,
    formatFieldValue,
    createDefaultTableBlock,
} from "./fsrs-table-format";

// Генерация DOM таблицы
export { generateTableDOM } from "./fsrs-table-generator";

// Экспорт типов для удобства
export type {
    ModernFSRSCard,
    ComputedCardState,
    FSRSSettings,
    FSRSState,
} from "../interfaces/fsrs";
