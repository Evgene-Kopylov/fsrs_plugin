/**
 * Модуль для типов и парсинга параметров универсального блока fsrs-table
 * Поддерживает режимы отображения: due, future, all
 */

// Типы режимов отображения
export type TableMode = "due" | "future" | "all";

// Определение колонки таблицы
export interface TableColumn {
	field: string; // идентификатор поля
	title: string; // заголовок колонки
	width?: string; // ширина колонки (опционально)
}

// Параметры таблицы
export interface TableParams {
	mode: TableMode;
	columns: TableColumn[];
	limit: number; // 0 означает "использовать значение из настроек"
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

// Поля по умолчанию для каждого режима
export const DEFAULT_COLUMNS: TableColumn[] = [
	{ field: "file", title: "Файл" },
	{ field: "reps", title: "Повторений" },
	{ field: "overdue", title: "Просрочка" },
];

/**
 * Парсит параметры из содержимого блока fsrs-table
 * @param source Исходный текст блока
 * @returns Объект с параметрами таблицы
 */
export function parseTableParams(source: string): TableParams {
	const params: TableParams = {
		mode: "due",
		columns: [...DEFAULT_COLUMNS],
		limit: 0, // 0 означает "использовать значение из настроек"
	};

	if (!source || source.trim() === "") {
		return params;
	}

	const lines = source
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	for (const line of lines) {
		// Парсинг mode
		const modeMatch = line.match(/^\s*mode\s*:\s*(\w+)\s*$/i);
		if (modeMatch && modeMatch[1]) {
			const modeValue = modeMatch[1].toLowerCase();
			if (
				modeValue === "due" ||
				modeValue === "future" ||
				modeValue === "all"
			) {
				params.mode = modeValue;
			} else {
				console.warn(
					`Неизвестный режим: ${modeValue}. Используется режим due.`,
				);
			}
			continue;
		}

		// Парсинг limit
		const limitMatch = line.match(/^\s*limit\s*:\s*(\d+)\s*$/i);
		if (limitMatch && limitMatch[1]) {
			const limitValue = parseInt(limitMatch[1], 10);
			if (!isNaN(limitValue) && limitValue > 0) {
				params.limit = limitValue;
			} else {
				console.warn(
					`Некорректный лимит: ${limitMatch[1]}. Лимит не применён.`,
				);
			}
			continue;
		}

		// Парсинг columns
		const columnsMatch = line.match(/^\s*columns\s*:\s*(.+)$/i);
		if (columnsMatch && columnsMatch[1]) {
			const columnsText = columnsMatch[1];
			try {
				const parsedColumns = parseColumnsDefinition(columnsText);
				// Проверяем, есть ли хотя бы одно валидное поле
				const validColumns = parsedColumns.filter((col) =>
					AVAILABLE_FIELDS.has(col.field),
				);
				if (validColumns.length > 0) {
					params.columns = validColumns;
				} else {
					console.warn(
						"Нет валидных полей в определении колонок. Используются колонки по умолчанию.",
					);
				}
			} catch (error) {
				console.warn(
					`Ошибка парсинга колонок: ${String(error)}. Используются колонки по умолчанию.`,
				);
			}
			continue;
		}

		// Если строка не соответствует ни одному паттерну, игнорируем её
		console.debug(
			`Строка проигнорирована при парсинге параметров: "${line}"`,
		);
	}

	return params;
}

/**
 * Парсит определение колонок в формате: поле1 as "Заголовок1", поле2 as "Заголовок2", поле3
 * @param columnsText Текст с определением колонок
 * @returns Массив объектов TableColumn
 */
export function parseColumnsDefinition(columnsText: string): TableColumn[] {
	console.debug(
		`[FSRS] parseColumnsDefinition: входной текст = "${columnsText}"`,
	);
	const columns: TableColumn[] = [];

	// Удаляем лишние пробелы и разбиваем по запятым
	const parts = columnsText
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	console.debug(
		`[FSRS] parseColumnsDefinition: частей после разбиения = ${parts.length}`,
		parts,
	);

	for (const part of parts) {
		// Пытаемся извлечь поле и заголовок
		const fieldMatch = part.match(/^(\w+)(?:\s+as\s+"([^"]+)")?$/);
		if (fieldMatch && fieldMatch[1]) {
			const field = fieldMatch[1].toLowerCase();
			const title = fieldMatch[2] || getDefaultTitle(field);
			columns.push({ field, title });
		} else {
			// Пробуем без кавычек
			const simpleMatch = part.match(/^(\w+)\s+as\s+(\S+)$/);
			if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
				const field = simpleMatch[1].toLowerCase();
				const title = simpleMatch[2];
				columns.push({ field, title });
			} else {
				// Просто поле без заголовка
				const field = part.toLowerCase();
				console.debug(
					`[FSRS] parseColumnsDefinition: поле без заголовка = "${field}"`,
				);
				if (AVAILABLE_FIELDS.has(field)) {
					columns.push({ field, title: getDefaultTitle(field) });
					console.debug(
						`[FSRS] parseColumnsDefinition: добавлена колонка field="${field}", title="${getDefaultTitle(field)}"`,
					);
				} else {
					console.warn(
						`Неизвестное поле в колонках: ${field}. Пропущено.`,
					);
				}
			}
		}
	}

	console.debug(
		`[FSRS] parseColumnsDefinition: итого колонок = ${columns.length}`,
		columns,
	);
	return columns;
}

/**
 * Возвращает заголовок по умолчанию для поля
 * @param field Идентификатор поля
 * @returns Заголовок по умолчанию
 */
export function getDefaultTitle(field: string): string {
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
