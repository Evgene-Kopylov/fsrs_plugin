/**
 * Главный файл с реэкспортами для блока fsrs-table
 * Заменяет блоки fsrs-now и fsrs-future, добавляет режим all
 */

// Реэкспорт типов и функций из модулей fsrs-table

// Типы и парсинг параметров
export type { TableMode, TableColumn, TableParams } from "./fsrs-table-params";
export {
	parseTableParams,
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
	formatOverdueForMode,
	extractDisplayName,
	translateState,
	formatFieldValue,
	createDefaultTableBlock,
} from "./fsrs-table-format";

// Генерация HTML таблицы
export {
	generateTableHTML,
	generateTableHTMLFromCards,
	generateEmptyTableHTML,
} from "./fsrs-table-generator";

// Экспорт типов для удобства
export type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
	FSRSState,
} from "../interfaces/fsrs";
