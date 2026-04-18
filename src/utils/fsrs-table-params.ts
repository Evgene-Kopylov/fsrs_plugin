/**
 * Модуль для типов и парсинга SQL-подобного синтаксиса блока fsrs-table
 * Поддерживает режимы отображения: due, all
 * Синтаксис: SELECT, FROM, ORDER BY, LIMIT
 */

// Типы режимов отображения
export type TableMode = "due" | "all";

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
	mode: TableMode;
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

// Поля по умолчанию для каждого режима
export const DEFAULT_COLUMNS: TableColumn[] = [
	{ field: "file", title: "Файл" },
	{ field: "reps", title: "Повторений" },
	{ field: "overdue", title: "Просрочка" },
];

// Типы токенов для парсинга
type TokenType =
	| "KEYWORD"
	| "IDENTIFIER"
	| "NUMBER"
	| "STRING"
	| "OPERATOR"
	| "EOF";

interface Token {
	type: TokenType;
	value: string;
	start: number;
}

/**
 * Простой лексер для SQL-подобного синтаксиса
 */
class SqlLexer {
	private position = 0;
	private readonly input: string;

	constructor(input: string) {
		// Заменяем переносы строк на пробелы для упрощения парсинга
		this.input = input.replace(/\r?\n/g, " ").trim();
	}

	/**
	 * Получает следующий токен
	 */
	nextToken(): Token {
		this.skipWhitespace();

		if (this.position >= this.input.length) {
			return { type: "EOF", value: "", start: this.position };
		}

		const currentChar = this.input[this.position]!;

		// Ключевые слова (идентификаторы, начинающиеся с буквы)
		if (this.isLetter(currentChar!)) {
			return this.readKeywordOrIdentifier();
		}

		// Числа
		if (this.isDigit(currentChar!)) {
			return this.readNumber();
		}

		// Строки в двойных кавычках
		if (currentChar! === '"') {
			return this.readString();
		}

		// Операторы и другие символы
		return this.readOperator();
	}

	/**
	 * Пропускает пробельные символы
	 */
	private skipWhitespace(): void {
		while (
			this.position < this.input.length &&
			/\s/.test(this.input[this.position]!)
		) {
			this.position++;
		}
	}

	/**
	 * Читает ключевое слово или идентификатор
	 */
	private readKeywordOrIdentifier(): Token {
		const start = this.position;
		let value = "";

		while (
			this.position < this.input.length &&
			this.isIdentifierChar(this.input[this.position]!)
		) {
			value += this.input[this.position]!;
			this.position++;
		}

		// Проверяем, является ли это ключевым словом
		const upperValue = value.toUpperCase();
		const keywords = [
			"SELECT",
			"FROM",
			"ORDER",
			"BY",
			"ASC",
			"DESC",
			"LIMIT",
			"AS",
		];

		if (keywords.includes(upperValue)) {
			return { type: "KEYWORD", value: upperValue, start };
		}

		return { type: "IDENTIFIER", value, start };
	}

	/**
	 * Читает число
	 */
	private readNumber(): Token {
		const start = this.position;
		let value = "";

		while (
			this.position < this.input.length &&
			this.isDigit(this.input[this.position]!)
		) {
			value += this.input[this.position]!;
			this.position++;
		}

		return { type: "NUMBER", value, start };
	}

	/**
	 * Читает строку в двойных кавычках
	 */
	private readString(): Token {
		const start = this.position;
		let value = "";
		this.position++; // Пропускаем открывающую кавычку

		while (
			this.position < this.input.length &&
			this.input[this.position]! !== '"'
		) {
			value += this.input[this.position]!;
			this.position++;
		}

		if (
			this.position < this.input.length &&
			this.input[this.position]! === '"'
		) {
			this.position++; // Пропускаем закрывающую кавычку
		}

		return { type: "STRING", value, start };
	}

	/**
	 * Читает оператор или другой символ
	 */
	private readOperator(): Token {
		const start = this.position;
		const value = this.input[this.position]!;
		this.position++;

		return { type: "OPERATOR", value, start };
	}

	/**
	 * Проверяет, является ли символ буквой
	 */
	private isLetter(char: string): boolean {
		return /[a-zA-Z]/.test(char);
	}

	/**
	 * Проверяет, является ли символ цифрой
	 */
	private isDigit(char: string): boolean {
		return /[0-9]/.test(char);
	}

	/**
	 * Проверяет, является ли символ допустимым для идентификатора
	 */
	private isIdentifierChar(char: string): boolean {
		return /[a-zA-Z0-9_]/.test(char);
	}
}

/**
 * Парсер SQL-подобного синтаксиса
 */
class SqlParser {
	private lexer: SqlLexer;
	private currentToken: Token;

	constructor(input: string) {
		this.lexer = new SqlLexer(input);
		this.currentToken = this.lexer.nextToken();
	}

	/**
	 * Парсит SQL-запрос и возвращает параметры таблицы
	 */
	parse(): TableParams {
		const params: TableParams = {
			mode: "due",
			columns: [...DEFAULT_COLUMNS],
			limit: 0,
		};

		// Парсим все ключевые слова в любом порядке
		while (this.currentToken.type !== "EOF") {
			if (this.currentToken.type === "KEYWORD") {
				switch (this.currentToken.value) {
					case "SELECT":
						this.consume("KEYWORD", "SELECT");
						params.columns = this.parseSelectClause();
						break;
					case "FROM":
						this.consume("KEYWORD", "FROM");
						params.mode = this.parseFromClause();
						break;
					case "ORDER":
						this.consume("KEYWORD", "ORDER");
						this.consume("KEYWORD", "BY");
						params.sort = this.parseOrderByClause();
						break;
					case "LIMIT":
						this.consume("KEYWORD", "LIMIT");
						params.limit = this.parseLimitClause();
						break;
					default:
						// Пропускаем неизвестные ключевые слова
						this.advance();
						break;
				}
			} else {
				this.advance();
			}
		}

		return params;
	}

	/**
	 * Парсит SELECT clause
	 */
	private parseSelectClause(): TableColumn[] {
		const columns: TableColumn[] = [];

		while (
			this.currentToken.type !== "EOF" &&
			this.currentToken.value !== "FROM" &&
			this.currentToken.value !== "ORDER" &&
			this.currentToken.value !== "LIMIT"
		) {
			const column = this.parseColumnDefinition();
			if (column) {
				columns.push(column);
			}

			// Если следующий токен - запятая, пропускаем её
			if (
				this.currentToken.type === "OPERATOR" &&
				this.currentToken.value === ","
			) {
				this.advance();
			} else {
				break;
			}
		}

		// Если нет валидных колонок, возвращаем колонки по умолчанию
		if (columns.length === 0) {
			console.warn(
				"Нет валидных полей в SELECT. Используются колонки по умолчанию.",
			);
			return [...DEFAULT_COLUMNS];
		}

		return columns;
	}

	/**
	 * Парсит определение колонки: field [as "alias"]
	 */
	private parseColumnDefinition(): TableColumn | null {
		let token = this.currentToken;
		if (token.type !== "IDENTIFIER") {
			console.warn(
				`Ожидается идентификатор поля, получено: ${token.value}`,
			);
			this.advance();
			return null;
		}

		const field = token.value.toLowerCase();
		this.advance();
		token = this.currentToken;

		let title = getDefaultTitle(field);

		// Проверяем наличие алиаса
		if (token.value === "AS") {
			this.consume("KEYWORD", "AS");
			token = this.currentToken;
			if (token.type === "STRING") {
				title = token.value;
				this.advance();
				token = this.currentToken;
			} else {
				console.warn(
					`Ожидается строка с алиасом в двойных кавычках, получено: ${token.value}`,
				);
			}
		}

		// Проверяем, является ли поле допустимым
		if (!AVAILABLE_FIELDS.has(field)) {
			console.warn(`Неизвестное поле: "${field}". Пропущено.`);
			return null;
		}

		return { field, title };
	}

	/**
	 * Парсит FROM clause
	 */
	private parseFromClause(): TableMode {
		let token = this.currentToken;
		if (token.type !== "IDENTIFIER") {
			console.warn(
				`Ожидается режим (due или all), получено: ${token.value}. Используется режим due.`,
			);
			return "due";
		}

		const mode = token.value.toLowerCase() as TableMode;
		this.advance();

		if (mode !== "due" && mode !== "all") {
			console.warn(
				`Неизвестный режим: "${mode}". Используется режим due.`,
			);
			return "due";
		}

		return mode;
	}

	/**
	 * Парсит ORDER BY clause
	 */
	private parseOrderByClause(): SortParam | undefined {
		let token = this.currentToken;
		if (token.type !== "IDENTIFIER") {
			console.warn(
				`Ожидается поле для сортировки, получено: ${token.value}. Параметр сортировки проигнорирован.`,
			);
			return undefined;
		}

		const field = token.value.toLowerCase();
		this.advance();
		token = this.currentToken;

		// Проверяем, является ли поле допустимым
		if (!AVAILABLE_FIELDS.has(field)) {
			console.warn(
				`Неизвестное поле для сортировки: "${field}". Параметр сортировки проигнорирован.`,
			);
			return undefined;
		}

		// Определяем направление сортировки (по умолчанию ASC)
		let direction: SortDirection = "ASC";

		if (token.value === "ASC" || token.value === "DESC") {
			direction = token.value as SortDirection;
			this.advance();
		}

		return { field, direction };
	}

	/**
	 * Парсит LIMIT clause
	 */
	private parseLimitClause(): number {
		let token = this.currentToken;
		if (token.type !== "NUMBER") {
			console.warn(
				`Ожидается число для LIMIT, получено: ${token.value}. Лимит не применён.`,
			);
			return 0;
		}

		const value = token.value;
		const limit = parseInt(value, 10);
		this.advance();

		if (isNaN(limit) || limit <= 0) {
			console.warn(`Некорректный LIMIT: ${value}. Лимит не применён.`);
			return 0;
		}

		return limit;
	}

	/**
	 * Потребляет токен ожидаемого типа и значения
	 */
	private consume(expectedType: TokenType, expectedValue?: string): void {
		if (this.currentToken.type !== expectedType) {
			throw new Error(
				`Ожидается ${expectedType}, получено ${this.currentToken.type}`,
			);
		}

		if (expectedValue && this.currentToken.value !== expectedValue) {
			throw new Error(
				`Ожидается ${expectedValue}, получено ${this.currentToken.value}`,
			);
		}

		this.advance();
	}

	/**
	 * Переходит к следующему токену
	 */
	private advance(): void {
		this.currentToken = this.lexer.nextToken();
	}
}

/**
 * Парсит SQL-подобный синтаксис блока fsrs-table
 * @param source Исходный текст блока
 * @returns Объект с параметрами таблицы
 */
export function parseSqlBlock(source: string): TableParams {
	if (!source || source.trim() === "") {
		console.warn(
			"Пустой блок fsrs-table. Используются значения по умолчанию.",
		);
		return {
			mode: "due",
			columns: [...DEFAULT_COLUMNS],
			limit: 0,
		};
	}

	try {
		const parser = new SqlParser(source);
		const params = parser.parse();

		// Проверяем, был ли указан FROM
		if (params.mode === "due" && !source.toUpperCase().includes("FROM")) {
			console.warn(
				"Не найден FROM в SQL-синтаксисе. Используется режим due.",
			);
		}

		return params;
	} catch (error) {
		console.error(
			`Ошибка парсинга SQL-подобного синтаксиса: ${String(error)}. Используются значения по умолчанию.`,
		);
		return {
			mode: "due",
			columns: [...DEFAULT_COLUMNS],
			limit: 0,
		};
	}
}

/**
 * Парсит определение колонок в формате: поле1 as "Заголовок1", поле2 as "Заголовок2", поле3
 * @param columnsText Текст с определением колонок
 * @returns Массив объектов TableColumn
 */
export function parseColumnsDefinition(columnsText: string): TableColumn[] {
	const columns: TableColumn[] = [];

	// Удаляем лишние пробелы и разбиваем по запятым
	const parts = columnsText
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	for (const part of parts) {
		// Пытаемся извлечь поле и заголовок
		const fieldMatch = part.match(/^(\w+)(?:\s+as\s+"([^"]+)")?$/);
		if (fieldMatch && fieldMatch[1]) {
			const field = fieldMatch[1].toLowerCase();
			const title = fieldMatch[2] || getDefaultTitle(field);

			if (AVAILABLE_FIELDS.has(field)) {
				columns.push({ field, title });
			} else {
				console.warn(
					`Неизвестное поле в колонках: "${field}". Пропущено.`,
				);
			}
		} else {
			console.warn(`Некорректный формат колонки: "${part}". Пропущено.`);
		}
	}

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

/**
 * Парсит параметры из содержимого блока fsrs-table (устаревшая функция, для совместимости)
 * @deprecated Используйте parseSqlBlock
 */
export function parseTableParams(source: string): TableParams {
	console.warn(
		"Функция parseTableParams устарела. Используйте SQL-подобный синтаксис.",
	);
	return parseSqlBlock(source);
}
