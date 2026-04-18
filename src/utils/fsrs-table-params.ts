/**
 * Модуль для типов и парсинга SQL-подобного синтаксиса блока fsrs-table
 * Поддерживает отображение всех карточек
 * Синтаксис: SELECT, ORDER BY, LIMIT
 */

import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

// Направление сортировки
export type SortDirection = "ASC" | "DESC";

// Определение колонки таблицы
export interface TableColumn {
	field: string; // идентификатор поля
	title: string; // заголовок колонки
	width?: string; // ширина колонки (опционально)
}

// Параметры сортировки
export interface SortParam {
	field: string; // поле для сортировки
	direction: SortDirection; // направление сортировки
}

// Параметры таблицы
export interface TableParams {
	columns: TableColumn[];
	limit: number; // 0 означает "использовать значение из настроек"
	sort?: SortParam; // параметры сортировки (опционально)
}

// Доступные поля для отображения в таблице
export const AVAILABLE_FIELDS = new Set([
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
]);

// Поля по умолчанию
export const DEFAULT_COLUMNS: TableColumn[] = [
	{ field: "file", title: "Файл" },
	{ field: "reps", title: "Повторений" },
	{ field: "overdue", title: "Просрочка" },
	{ field: "state", title: "Состояние" },
	{ field: "due", title: "Следующее повторение" },
];

/**
 * Парсит SQL-подобный синтаксис блока fsrs-table
 * Использует WASM реализацию парсинга на Rust
 * @param source Исходный текст блока
 * @returns Объект с параметрами таблицы
 */
export function parseSqlBlock(source: string): TableParams {
	if (!source || source.trim() === "") {
		console.warn(
			"Пустой блок fsrs-table. Используются значения по умолчанию.",
		);
		return {
			columns: [...DEFAULT_COLUMNS],
			limit: 0,
		};
	}

	try {
		// Вызываем WASM функцию для парсинга
		const resultJson = wasm.parse_fsrs_table_block(source);

		// Парсим JSON результат
		const parsedResult = JSON.parse(resultJson);

		// Если в результате есть ошибка, возвращаем параметры по умолчанию
		if (parsedResult.error) {
			console.error(
				`Ошибка парсинга SQL-подобного синтаксиса: ${parsedResult.error}. Используются значения по умолчанию.`,
			);
			return (
				parsedResult.params || {
					columns: [...DEFAULT_COLUMNS],
					limit: 0,
				}
			);
		}

		// Преобразуем результат из WASM в TypeScript типы
		const wasmParams = parsedResult as TableParams;

		// Преобразуем direction из "Asc"/"Desc" в "ASC"/"DESC"
		if (wasmParams.sort) {
			const tsSort: SortParam = {
				field: wasmParams.sort.field,
				direction: (
					wasmParams.sort.direction as string
				).toUpperCase() as SortDirection,
			};

			// Проверяем, что direction валидный
			if (tsSort.direction !== "ASC" && tsSort.direction !== "DESC") {
				tsSort.direction = "ASC"; // Значение по умолчанию
			}

			return {
				columns: wasmParams.columns,
				limit: wasmParams.limit,
				sort: tsSort,
			};
		}

		return wasmParams;
	} catch (error) {
		console.error(
			`Ошибка парсинга SQL-подобного синтаксиса: ${String(error)}. Используются значения по умолчанию.`,
		);
		return {
			columns: [...DEFAULT_COLUMNS],
			limit: 0,
		};
	}
}

/**
 * Парсит определение колонок в формате: поле1 as "Заголовок1", поле2 as "Заголовок2", поле3
 * Использует WASM реализацию для полного парсинга SQL
 * @param columnsText Текст с определением колонок
 * @returns Массив объектов TableColumn
 */
export function parseColumnsDefinition(columnsText: string): TableColumn[] {
	if (!columnsText.trim()) {
		return [...DEFAULT_COLUMNS];
	}

	try {
		// Создаём полный SQL запрос для парсинга
		const sql = `SELECT ${columnsText}`;
		const resultJson = wasm.parse_fsrs_table_block(sql);
		const parsedResult = JSON.parse(resultJson);

		if (parsedResult.error) {
			console.warn(
				`Ошибка парсинга колонок: ${parsedResult.error}. Используются колонки по умолчанию.`,
			);
			return [...DEFAULT_COLUMNS];
		}

		const wasmParams = parsedResult as TableParams;
		return wasmParams.columns;
	} catch (error) {
		console.warn(
			`Ошибка парсинга колонок: ${String(error)}. Используются колонки по умолчанию.`,
		);
		return [...DEFAULT_COLUMNS];
	}
}

/**
 * Возвращает заголовок по умолчанию для поля
 * Использует WASM реализацию для получения заголовков
 * @param field Идентификатор поля
 * @returns Заголовок по умолчанию
 */
export function getDefaultTitle(field: string): string {
	try {
		// Используем WASM функцию для получения заголовка по умолчанию
		return wasm.get_default_column_title(field);
	} catch (error) {
		console.warn(
			`Ошибка получения заголовка для поля "${field}": ${String(error)}. Используется локальный заголовок.`,
		);
		// Fallback на локальные заголовки
		const titles: Record<string, string> = {
			file: "Файл",
			reps: "Повторений",
			overdue: "Просрочка",
			stability: "Стабильность",
			difficulty: "Сложность",
			retrievability: "Извлекаемость",
			due: "Следующее повторение",
			state: "Состояние",
			elapsed: "Прошло дней",
			scheduled: "Запланировано дней",
		};
		return titles[field] || field;
	}
}

/**
 * Проверяет, является ли поле валидным для использования в таблице
 * Использует WASM реализацию для проверки
 * @param field Идентификатор поля для проверки
 * @returns true если поле валидное, false если нет
 */
export function isValidTableField(field: string): boolean {
	try {
		// Используем WASM функцию для проверки валидности поля
		return wasm.is_valid_table_field(field);
	} catch (error) {
		console.warn(
			`Ошибка проверки валидности поля "${field}": ${String(error)}. Используется локальная проверка.`,
		);
		// Fallback на локальную проверку
		return AVAILABLE_FIELDS.has(field);
	}
}

/**
 * Парсит параметры из содержимого блока fsrs-table (устаревшая функция, для совместимости)
 * @deprecated Используйте parseSqlBlock
 */
export function parseTableParams(source: string): TableParams {
	console.warn(
		"Функция parseTableParams устарела. Используйте parseSqlBlock.",
	);
	return parseSqlBlock(source);
}
