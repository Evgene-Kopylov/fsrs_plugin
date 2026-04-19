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
export {
	parseSqlBlock,
	parseColumnsDefinition,
	getDefaultTitle,
	AVAILABLE_FIELDS,
	DEFAULT_COLUMNS,
} from "./fsrs-table-params";

// Фильтрация и сортировка карточек
export type { CardWithState } from "./fsrs-table-filter";
export { filterAndSortCards } from "./fsrs-table-filter";

// Форматирование значений
export {
	formatOverdue,
	extractDisplayName,
	translateState,
	formatFieldValue,
	createDefaultTableBlock,
} from "./fsrs-table-format";

// Генерация HTML таблицы
export {
	generateTableHTML,
	generateTableHTMLFromCards,
	generateTableHTMLFromSql,
	generateEmptyTableHTML,
} from "./fsrs-table-generator";

// Экспорт типов для удобства
export type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
	FSRSState,
} from "../interfaces/fsrs";
