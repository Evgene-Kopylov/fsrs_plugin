/**
 * Модуль для типов и парсинга SQL-подобного синтаксиса блока fsrs-table
 * Поддерживает отображение всех карточек
 * Синтаксис: SELECT, ORDER BY, LIMIT
 */

import * as wasm from "../../wasm-lib/pkg/wasm_lib";

/**
 * Результат парсинга из WASM: всегда содержит params, может содержать error
 */
interface WasmParseResult {
	error?: string;
	params: unknown;
}

/**
 * Проверяет, что значение является TableParams
 */
function isTableParams(value: unknown): value is TableParams {
	if (!value || typeof value !== "object") {
		return false;
	}
	const obj = value as unknown as Record<string, unknown>;

	// Проверяем наличие обязательных полей
	if (!("columns" in obj) || !("limit" in obj)) {
		return false;
	}

	// Проверяем типы
	if (!Array.isArray(obj.columns)) {
		return false;
	}

	// limit может быть number или string (после JSON сериализации)
	const limit = obj.limit;
	if (typeof limit !== "number" && typeof limit !== "string") {
		return false;
	}

	// Проверяем структуру колонок (не строгая проверка)
	for (const col of obj.columns) {
		if (typeof col !== "object" || col === null) {
			return false;
		}
		const colObj = col as unknown as Record<string, unknown>;
		if (typeof colObj.field !== "string") {
			return false;
		}
	}

	return true;
}

/**
 * Преобразует unknown в TableParams, если возможно
 */
function convertToTableParams(value: unknown): TableParams | null {
	if (!isTableParams(value)) {
		return null;
	}

	const obj = value as unknown as Record<string, unknown>;

	// Преобразуем limit в number
	const limit =
		typeof obj.limit === "string"
			? parseInt(obj.limit, 10)
			: (obj.limit as number);

	// Преобразуем колонки
	const columns: TableColumn[] = [];
	for (const col of obj.columns as Array<Record<string, unknown>>) {
		const field = String(col.field);
		const title =
			typeof col.title === "string" ? col.title : getDefaultTitle(field);
		const width = typeof col.width === "string" ? col.width : undefined;

		columns.push({ field, title, width });
	}

	// Преобразуем сортировку, если есть
	let sort: SortParam | undefined = undefined;
	if (obj.sort && typeof obj.sort === "object") {
		const sortObj = obj.sort as unknown as Record<string, unknown>;
		if (typeof sortObj.field === "string" && sortObj.direction) {
			let directionStr = "ASC";
			if (typeof sortObj.direction === "string") {
				directionStr = sortObj.direction.toUpperCase();
			} else if (
				sortObj.direction !== null &&
				typeof sortObj.direction === "object"
			) {
				// Если это объект, попробуем извлечь значение из возможных ключей
				const dirObj = sortObj.direction as unknown as Record<
					string,
					unknown
				>;
				if (dirObj.Asc !== undefined || dirObj.ASC !== undefined) {
					directionStr = "ASC";
				} else if (
					dirObj.Desc !== undefined ||
					dirObj.DESC !== undefined
				) {
					directionStr = "DESC";
				}
			}
			const direction =
				directionStr === "ASC" || directionStr === "DESC"
					? (directionStr as SortDirection)
					: "ASC";
			sort = {
				field: sortObj.field,
				direction,
			};
		}
	}

	return {
		columns,
		limit: limit || 0,
		sort,
	};
}

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
		console.debug("WASM parse result JSON:", resultJson);

		// Парсим JSON результат с явной типизацией
		const parsedResult: WasmParseResult = JSON.parse(
			resultJson,
		) as WasmParseResult;

		console.debug("Parsed WASM result:", parsedResult);

		// Пытаемся преобразовать params в TableParams
		const tableParams = convertToTableParams(parsedResult.params);

		if (parsedResult.error) {
			console.error(
				`Ошибка парсинга SQL-подобного синтаксиса: ${parsedResult.error}`,
			);

			// Если есть ошибка, но params валидны, используем их
			if (tableParams) {
				console.warn("Используем параметры из WASM несмотря на ошибку");
				return tableParams;
			}

			// Иначе используем значения по умолчанию
			console.warn("Используются значения по умолчанию из-за ошибки");
			return {
				columns: [...DEFAULT_COLUMNS],
				limit: 0,
			};
		}

		// Если нет ошибки, но params не валидны
		if (!tableParams) {
			console.error(
				"Некорректные параметры таблицы от WASM. Используются значения по умолчанию.",
				parsedResult.params,
			);
			return {
				columns: [...DEFAULT_COLUMNS],
				limit: 0,
			};
		}

		return tableParams;
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
		const parsedResult: WasmParseResult = JSON.parse(
			resultJson,
		) as WasmParseResult;

		if (parsedResult.error) {
			console.warn(
				`Ошибка парсинга колонок: ${parsedResult.error}. Используются колонки по умолчанию.`,
			);
			return [...DEFAULT_COLUMNS];
		}

		const tableParams = convertToTableParams(parsedResult.params);
		if (!tableParams) {
			console.warn(
				"Некорректные параметры таблицы от WASM для колонок. Используются колонки по умолчанию.",
			);
			return [...DEFAULT_COLUMNS];
		}

		return tableParams.columns;
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
