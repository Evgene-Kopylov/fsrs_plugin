import * as wasm from "../../wasm-lib/pkg/wasm_lib";
import { formatError } from "./fsrs-table-format";

// Типы данных для таблицы FSRS

/**
 * Параметры сортировки
 */
export interface SortParam {
    field: string;
    direction: SortDirection;
}

/**
 * Направление сортировки
 */
export type SortDirection = "ASC" | "DESC";

/**
 * Колонка таблицы
 */
export interface TableColumn {
    field: string; // идентификатор поля
    title: string; // заголовок колонки
    width?: string; // ширина колонки (опционально)
}

/**
 * Параметры таблицы
 */
export interface TableParams {
    columns: TableColumn[];
    limit: number; // 0 означает "использовать DEFAULT_TABLE_DISPLAY_LIMIT" — лимит отображения строк в таблице, не лимит выборки
    sort?: SortParam; // параметры сортировки (опционально)
    where?: unknown; // условие фильтрации WHERE (опционально) - сериализованное выражение Expression из WASM (поле where_condition)
}

/**
 * Предупреждение парсинга из WASM
 */
interface WasmParseWarning {
    type: string;
    message: string;
}

/**
 * Результат парсинга из WASM
 */
interface WasmParseResult {
    error?: string;
    params?: unknown;
    warnings: WasmParseWarning[];
}

/**
 * Доступные поля для таблицы
 */
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

/**
 * Проверяет, является ли объект параметрами таблицы
 */
function isTableParams(value: unknown): value is TableParams {
    if (!value || typeof value !== "object") {
        return false;
    }

    const obj = value as Record<string, unknown>;

    // Проверяем обязательные поля
    if (
        !obj.columns ||
        !Array.isArray(obj.columns) ||
        obj.columns.length === 0
    ) {
        return false;
    }

    // Проверяем каждую колонку
    for (const col of obj.columns as Array<unknown>) {
        if (!col || typeof col !== "object") {
            return false;
        }
        const colObj = col as Record<string, unknown>;
        if (typeof colObj.field !== "string" || colObj.field.trim() === "") {
            return false;
        }
    }

    // Проверяем limit
    if (typeof obj.limit !== "number") {
        return false;
    }

    return true;
}

/**
 * Преобразует результат парсинга WASM в TableParams
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
        const title = typeof col.title === "string" ? col.title : field;
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
                if (typeof dirObj.direction === "string") {
                    directionStr = dirObj.direction.toUpperCase();
                } else if (typeof dirObj.value === "string") {
                    directionStr = dirObj.value.toUpperCase();
                }
            }

            if (directionStr === "ASC" || directionStr === "DESC") {
                sort = {
                    field: sortObj.field,
                    direction: directionStr,
                };
            }
        }
    }

    // Условие WHERE (передаётся как where_condition из WASM)
    const where = obj.where_condition;

    return {
        columns,
        limit,
        sort,
        where,
    };
}

/**
 * Парсит SQL-подобный блок fsrs-table
 * @param source Исходный текст SQL-подобного запроса
 * @returns Объект TableParams с параметрами таблицы
 * @throws Error при ошибке парсинга или некорректных данных
 */
export function parseSqlBlock(source: string): TableParams {
    if (!source.trim()) {
        throw new Error(formatError("Пустой SQL запрос"));
    }

    try {
        // Вызываем WASM функцию для парсинга
        const resultJson = wasm.parse_fsrs_table_block(source);

        // Парсим JSON результат с явной типизацией
        const parsedResult: WasmParseResult = JSON.parse(
            resultJson,
        ) as WasmParseResult;

        // Проверяем наличие ошибки от WASM
        if (parsedResult.error) {
            throw new Error(
                formatError(`Ошибка парсинга SQL: ${parsedResult.error}`),
            );
        }

        // Пытаемся преобразовать params в TableParams
        if (!parsedResult.params) {
            throw new Error(
                formatError("Ошибка парсинга SQL: отсутствуют параметры"),
            );
        }

        const tableParams = convertToTableParams(parsedResult.params);
        if (!tableParams) {
            throw new Error(
                formatError(
                    `Не удалось преобразовать результат парсинга: ${JSON.stringify(
                        parsedResult.params,
                    )}`,
                ),
            );
        }

        // Обрабатываем предупреждения, если есть
        if (parsedResult.warnings && parsedResult.warnings.length > 0) {
            for (const warning of parsedResult.warnings) {
                console.warn(
                    `Предупреждение парсинга (${warning.type}): ${warning.message}`,
                );

                // Если есть неизвестное поле, бросаем ошибку
                if (warning.type === "UnknownField") {
                    throw new Error(
                        formatError(
                            `Неизвестное поле в запросе: ${warning.message}`,
                        ),
                    );
                }
                // Если есть неизвестное поле для сортировки, бросаем ошибку
                if (warning.type === "UnknownSortField") {
                    throw new Error(
                        formatError(
                            `Неизвестное поле для сортировки: ${warning.message}`,
                        ),
                    );
                }
            }
        }

        return tableParams;
    } catch (error) {
        throw new Error(formatError(`Ошибка парсинга SQL: ${String(error)}`));
    }
}
