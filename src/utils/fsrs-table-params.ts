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
 * Максимальная длина сообщения об ошибке для отображения
 */
const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Форматирует сообщение об ошибке в стиле Dataview
 * @param errorMessage Сообщение об ошибке
 * @returns Отформатированное сообщение об ошибке
 */
function formatError(errorMessage: string): string {
	// Ограничиваем длину сообщения об ошибке
	const truncatedMessage =
		errorMessage.length > MAX_ERROR_MESSAGE_LENGTH
			? errorMessage.substring(0, MAX_ERROR_MESSAGE_LENGTH) +
				"... [truncated]"
			: errorMessage;

	return `FSRS: Error:\n-- PARSING FAILED --------------------------------------------------\n\n${truncatedMessage}\n`;
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
 * Проверяет валидность параметров таблицы
 * @param params Параметры таблицы для проверки
 * @throws Error при невалидных параметрах
 */
function validateTableParams(params: TableParams): void {
	if (!params.columns || params.columns.length === 0) {
		throw new Error(
			formatError("Таблица должна содержать хотя бы одну колонку"),
		);
	}

	for (const column of params.columns) {
		if (!column.field) {
			throw new Error(formatError(`Колонка должна иметь поле (field)`));
		}
		if (!isValidTableField(column.field)) {
			throw new Error(
				formatError(`Недопустимое поле таблицы: "${column.field}"`),
			);
		}
	}

	if (params.limit < 0) {
		throw new Error(
			formatError(`Лимит не может быть отрицательным: ${params.limit}`),
		);
	}

	if (params.sort) {
		if (!params.sort.field) {
			throw new Error(formatError("Поле сортировки должно быть указано"));
		}
		if (!isValidTableField(params.sort.field)) {
			throw new Error(
				formatError(
					`Недопустимое поле для сортировки: "${params.sort.field}"`,
				),
			);
		}
		if (
			params.sort.direction !== "ASC" &&
			params.sort.direction !== "DESC"
		) {
			throw new Error(
				formatError(
					`Недопустимое направление сортировки: "${params.sort.direction}"`,
				),
			);
		}
	}
}

/**
 * Парсит SQL-подобный синтаксис блока fsrs-table
 * Использует WASM реализацию парсинга на Rust
 * @param source Исходный текст блока
 * @returns Объект с параметрами таблицы
 * @throws Error при ошибке парсинга или некорректных данных
 */
export function parseSqlBlock(source: string): TableParams {
	if (!source || source.trim() === "") {
		throw new Error(formatError("Пустой блок fsrs-table"));
	}

	try {
		// Вызываем WASM функцию для парсинга
		const resultJson = wasm.parse_fsrs_table_block(source);
		// FIXME: убрать перд официальным релизом в Обсидиан
		// eslint-disable-next-line no-console
		console.info("WASM parse result JSON:", resultJson);

		// Парсим JSON результат с явной типизацией
		const parsedResult: WasmParseResult = JSON.parse(
			resultJson,
		) as WasmParseResult;

		// FIXME: убрать перд официальным релизом в Обсидиан
		// eslint-disable-next-line no-console
		console.info("Parsed WASM result:", parsedResult);

		// Пытаемся преобразовать params в TableParams
		const tableParams = convertToTableParams(parsedResult.params);

		if (parsedResult.error) {
			const errorMessage = `Ошибка парсинга SQL-подобного синтаксиса: ${parsedResult.error}`;
			console.error(errorMessage);
			throw new Error(formatError(errorMessage));
		}

		// Если нет ошибки, но params не валидны
		if (!tableParams) {
			const errorMessage = "Некорректные параметры таблицы от WASM";
			console.error(errorMessage, parsedResult.params);
			throw new Error(formatError(errorMessage));
		}

		// Проверяем валидность полученных параметров
		validateTableParams(tableParams);
		return tableParams;
	} catch (error) {
		if (error instanceof Error) {
			// Если это уже наша отформатированная ошибка, просто пробрасываем её
			if (error.message.startsWith("FSRS: Error:")) {
				throw error;
			}
			throw new Error(
				formatError(
					`Ошибка парсинга SQL-подобного синтаксиса: ${error.message}`,
				),
			);
		}
		throw new Error(
			formatError(
				`Ошибка парсинга SQL-подобного синтаксиса: ${String(error)}`,
			),
		);
	}
}

/**
 * Парсит определение колонок в формате: поле1 as "Заголовок1", поле2 as "Заголовок2", поле3
 * Использует WASM реализацию для полного парсинга SQL
 * @param columnsText Текст с определением колонок
 * @returns Массив объектов TableColumn
 * @throws Error при ошибке парсинга или некорректных данных
 */
export function parseColumnsDefinition(columnsText: string): TableColumn[] {
	if (!columnsText.trim()) {
		throw new Error(formatError("Пустое определение колонок"));
	}

	try {
		// Создаём полный SQL запрос для парсинга
		const sql = `SELECT ${columnsText}`;
		const resultJson = wasm.parse_fsrs_table_block(sql);
		const parsedResult: WasmParseResult = JSON.parse(
			resultJson,
		) as WasmParseResult;

		if (parsedResult.error) {
			const errorMessage = `Ошибка парсинга колонок: ${parsedResult.error}`;
			console.warn(errorMessage);
			throw new Error(formatError(errorMessage));
		}

		const tableParams = convertToTableParams(parsedResult.params);
		if (!tableParams) {
			const errorMessage =
				"Некорректные параметры таблицы от WASM для колонок";
			console.warn(errorMessage);
			throw new Error(formatError(errorMessage));
		}

		return tableParams.columns;
	} catch (error) {
		if (error instanceof Error) {
			// Если это уже наша отформатированная ошибка, просто пробрасываем её
			if (error.message.startsWith("FSRS: Error:")) {
				throw error;
			}
			throw new Error(
				formatError(`Ошибка парсинга колонок: ${error.message}`),
			);
		}
		throw new Error(
			formatError(`Ошибка парсинга колонок: ${String(error)}`),
		);
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
