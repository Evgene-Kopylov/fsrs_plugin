/**
 * Модуль для фильтрации и сортировки карточек блока fsrs-table
 * Использует WASM реализацию на Rust для максимальной производительности и совместимости
 */

import type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
	FSRSState,
} from "../interfaces/fsrs";
import type { SortParam, TableParams } from "./fsrs-table-params";
import { DEFAULT_COLUMNS } from "./fsrs-table-params";
import * as wasm from "../../wasm-lib/pkg/wasm_lib";

/**
 * Результат фильтрации и сортировки карточек с состояниями
 */
export interface CardWithState {
	card: ModernFSRSCard;
	state: ComputedCardState;
	isDue: boolean;
}

/**
 * Вычисленные поля карточки из WASM (соответствует Rust структуре CardWithComputedFields)
 */
interface WasmComputedFields {
	file?: string;
	reps?: number;
	overdue?: number;
	stability?: number;
	difficulty?: number;
	retrievability?: number;
	due?: string; // в формате Obsidian: ГГГГ-ММ-ДД_чч:мм
	state?: string;
	elapsed?: number;
	scheduled?: number;
	additional_fields?: Record<string, unknown>;
}

/**
 * Карточка с вычисленными полями из WASM
 */
interface WasmCardResult {
	card_json: string; // JSON строка с ModernFSRSCard
	computed_fields: WasmComputedFields;
}

/**
 * Полный результат фильтрации из WASM
 */
interface WasmFilterResult {
	cards: WasmCardResult[];
	total_count: number;
	errors: string[];
}

/**
 * Результат фильтрации из WASM с SQL запросом
 */
interface WasmSqlFilterResult {
	params: unknown;
	cards: {
		cards: WasmCardResult[];
		total_count: number;
		errors: string[];
	};
	error?: string;
}

/**
 * Преобразует строку состояния из WASM в FSRSState
 * @param wasmState Строка состояния из WASM (должна быть на английском)
 * @returns FSRSState или "New" по умолчанию
 */
function convertWasmStateToFSRSState(wasmState?: string): FSRSState {
	if (!wasmState) {
		return "New";
	}

	const stateMap: Record<string, FSRSState> = {
		new: "New",
		learning: "Learning",
		review: "Review",
		relearning: "Relearning",
		due: "Review", // "due" преобразуем в "Review", так как в FSRSState нет состояния "due"
	};

	return stateMap[wasmState.toLowerCase()] || "New";
}

/**
 * Фильтрует и сортирует карточки в соответствии с SQL-запросом
 * Использует WASM реализацию на Rust для максимальной производительности
 * @param cards Массив карточек
 * @param settings Настройки плагина
 * @param sqlSource SQL-подобный запрос для фильтрации и сортировки
 * @param now Текущее время
 * @returns Отфильтрованный и отсортированный массив карточек с состояниями
 */
export async function filterAndSortCardsWithSql(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	sqlSource: string,
	now: Date = new Date(),
): Promise<{ params: TableParams; cards: CardWithState[] }> {
	if (!cards || cards.length === 0) {
		const defaultParams: TableParams = {
			columns: DEFAULT_COLUMNS,
			limit: 0,
		};
		return { params: defaultParams, cards: [] };
	}

	try {
		// Вызываем WASM функцию для фильтрации и сортировки с SQL напрямую
		console.debug("filterAndSortCardsWithSql:", {
			cardCount: cards.length,
			sqlSource,
			now: now.toISOString(),
			settings: JSON.parse(JSON.stringify(settings)),
		});
		// Логируем первые 3 карточки для отладки фильтрации WHERE
		if (cards.length > 0) {
			console.debug(
				"First 3 cards:",
				cards.slice(0, 3).map((card) => ({
					filePath: card.filePath,
					reviewsCount: card.reviews.length,
					lastReview:
						card.reviews.length > 0
							? (card.reviews[card.reviews.length - 1]?.date ??
								null)
							: null,
				})),
			);
		}
		const resultJson = wasm.filter_and_sort_cards_with_sql(
			JSON.stringify(cards),
			sqlSource,
			JSON.stringify(settings),
			now.toISOString(),
		);

		// Парсим результат с новым форматом
		const wasmSqlResult: WasmSqlFilterResult = JSON.parse(
			resultJson,
		) as unknown as WasmSqlFilterResult;

		console.debug("wasmSqlResult structure:", {
			hasError: !!wasmSqlResult.error,
			hasCards: !!wasmSqlResult.cards,
			hasParams: !!wasmSqlResult.params,
			cardsKeys: wasmSqlResult.cards
				? Object.keys(wasmSqlResult.cards)
				: [],
			paramsKeys: wasmSqlResult.params
				? Object.keys(wasmSqlResult.params)
				: [],
		});

		// Проверяем наличие ошибки парсинга SQL
		if (wasmSqlResult.error) {
			const errorMessage = wasmSqlResult.error;
			console.error(`Ошибка парсинга SQL запроса: ${errorMessage}`);
			throw new Error(`Ошибка парсинга SQL запроса: ${errorMessage}`);
		}

		// Извлекаем результат фильтрации и параметры
		const wasmResult = wasmSqlResult.cards;
		const params = wasmSqlResult.params as TableParams;

		console.debug("wasmResult structure:", {
			cardsCount: wasmResult?.cards?.length || 0,
			errors: wasmResult?.errors?.length || 0,
			total_count: wasmResult?.total_count || 0,
		});

		// Обрабатываем ошибки, если есть
		if (wasmResult.errors && wasmResult.errors.length > 0) {
			console.warn(
				`При фильтрации и сортировке карточек возникли ошибки:`,
				wasmResult.errors,
			);
		}

		// Преобразуем результат WASM в формат TypeScript
		const cardsWithState: CardWithState[] = [];

		for (const wasmCard of wasmResult.cards) {
			try {
				console.debug("Processing wasmCard - detailed:", {
					hasCardJson: !!wasmCard.card_json,
					computedFields: wasmCard.computed_fields,
					computedFieldsKeys: wasmCard.computed_fields
						? Object.keys(wasmCard.computed_fields)
						: [],
					computedFieldsFull: wasmCard.computed_fields,
				});

				// Парсим карточку из JSON с явным приведением типов
				const card: ModernFSRSCard = JSON.parse(
					wasmCard.card_json,
				) as unknown as ModernFSRSCard;

				// Преобразуем вычисленные поля в состояние
				const state = convertWasmFieldsToComputedState(
					wasmCard.computed_fields,
				);

				// Логируем значение overdue для отладки фильтрации WHERE
				console.debug("Card overdue value:", {
					file: card.filePath,
					overdue: state.overdue,
					due: state.due,
					computed_fields: wasmCard.computed_fields,
				});

				// Определяем, является ли карточка просроченной
				const isDue = isCardDue(
					state.state,
					wasmCard.computed_fields.state,
					state.due,
					now,
				);

				cardsWithState.push({
					card,
					state,
					isDue,
				});
			} catch (error) {
				console.warn(
					`Ошибка преобразования карточки из WASM результата:`,
					error,
				);
				// Пропускаем карточки с ошибками преобразования
				continue;
			}
		}

		return { params, cards: cardsWithState };
	} catch (error) {
		console.error(
			`Ошибка фильтрации и сортировки карточек через WASM: ${String(error)}. Возвращаем пустой массив.`,
		);

		// В случае ошибки WASM, возвращаем пустой массив
		// В будущих версиях можно добавить fallback на старую реализацию
		const defaultParams: TableParams = {
			columns: DEFAULT_COLUMNS,
			limit: 0,
		};
		return { params: defaultParams, cards: [] };
	}
}

/**
 * Преобразует вычисленные поля из WASM в ComputedCardState
 * @param wasmFields Вычисленные поля из WASM
 * @returns ComputedCardState
 */
function convertWasmFieldsToComputedState(
	wasmFields: WasmComputedFields,
): ComputedCardState {
	// Логируем все поля wasmFields для отладки
	console.debug("convertWasmFieldsToComputedState - full structure:", {
		file: wasmFields.file,
		reps: wasmFields.reps,
		overdue: wasmFields.overdue,
		stability: wasmFields.stability,
		difficulty: wasmFields.difficulty,
		retrievability: wasmFields.retrievability,
		due: wasmFields.due,
		state: wasmFields.state,
		elapsed: wasmFields.elapsed,
		scheduled: wasmFields.scheduled,
		additional_fields: wasmFields.additional_fields,
		has_additional_fields: wasmFields.additional_fields
			? Object.keys(wasmFields.additional_fields).length
			: 0,
	});

	// Преобразуем дату из формата Obsidian в ISO
	let dueDate = "";
	if (wasmFields.due) {
		// Формат Obsidian: "2024-01-10_10:30" → ISO: "2024-01-10T10:30:00.000Z"
		// Пытаемся преобразовать
		try {
			const parts = wasmFields.due.split("_");
			if (parts.length === 2) {
				dueDate = `${parts[0]}T${parts[1]}:00.000Z`;
			}
		} catch {
			// В случае ошибки оставляем пустую строку
		}
	}

	return {
		due: dueDate,
		overdue: wasmFields.overdue ?? 0,
		stability: wasmFields.stability || 0,
		difficulty: wasmFields.difficulty || 0,
		state: convertWasmStateToFSRSState(wasmFields.state),
		elapsed_days: wasmFields.elapsed || 0,
		scheduled_days: wasmFields.scheduled || 0,
		reps: wasmFields.reps || 0,
		lapses: 0, // Не вычисляется в текущей WASM реализации
		retrievability: wasmFields.retrievability || 0,
	};
}

/**
 * Определяет, является ли карточка просроченной
 * @param fsrsState Состояние карточки (FSRSState)
 * @param wasmStateStr Исходное состояние из WASM (для определения "due")
 * @param dueDateStr Дата следующего повторения в ISO формате
 * @param now Текущее время
 * @returns true если карточка просрочена
 */
function isCardDue(
	fsrsState: FSRSState,
	wasmStateStr: string | undefined,
	dueDateStr: string,
	now: Date,
): boolean {
	if (!dueDateStr) {
		return false;
	}

	// Если WASM вернул состояние "due", карточка точно просрочена
	if (wasmStateStr?.toLowerCase() === "due") {
		return true;
	}

	try {
		const dueDate = new Date(dueDateStr);
		// Для состояния "Review" проверяем дату
		if (fsrsState === "Review") {
			return dueDate.getTime() <= now.getTime();
		}
		// Для состояния "Learning" карточка всегда due
		if (fsrsState === "Learning") {
			return true;
		}
	} catch {
		// В случае ошибки парсинга даты
		return false;
	}

	return false;
}

/**
 * Фильтрует и сортирует карточки в соответствии с параметрами
 * Использует WASM реализацию на Rust для максимальной производительности
 * @param cards Массив карточек
 * @param settings Настройки плагина
 * @param params Параметры таблицы (сортировка и лимит)
 * @param now Текущее время
 * @returns Отфильтрованный и отсортированный массив карточек с состояниями
 */
export async function filterAndSortCards(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	params: TableParams,
	now: Date = new Date(),
): Promise<CardWithState[]> {
	if (!cards || cards.length === 0) {
		return [];
	}

	try {
		// Преобразуем параметры сортировки для WASM
		const wasmParams = {
			columns: params.columns,
			limit: params.limit,
			sort: params.sort
				? {
						field: params.sort.field,
						direction: params.sort.direction,
					}
				: undefined,
			where_condition: params.where,
		};

		// Вызываем WASM функцию для фильтрации и сортировки
		const resultJson = wasm.filter_and_sort_cards(
			JSON.stringify(cards),
			JSON.stringify(wasmParams),
			JSON.stringify(settings),
			now.toISOString(),
		);

		// Парсим результат с явным приведением типов
		const wasmResult: WasmFilterResult = JSON.parse(
			resultJson,
		) as unknown as WasmFilterResult;

		// Обрабатываем ошибки, если есть
		if (wasmResult.errors && wasmResult.errors.length > 0) {
			console.warn(
				`При фильтрации и сортировке карточек возникли ошибки:`,
				wasmResult.errors,
			);
		}

		// Преобразуем результат WASM в формат TypeScript
		const cardsWithState: CardWithState[] = [];

		for (const wasmCard of wasmResult.cards) {
			try {
				// Парсим карточку из JSON с явным приведением типов
				const card: ModernFSRSCard = JSON.parse(
					wasmCard.card_json,
				) as unknown as ModernFSRSCard;

				// Преобразуем вычисленные поля в состояние
				const state = convertWasmFieldsToComputedState(
					wasmCard.computed_fields,
				);

				// Определяем, является ли карточка просроченной
				const isDue = isCardDue(
					state.state,
					wasmCard.computed_fields.state,
					state.due,
					now,
				);

				cardsWithState.push({
					card,
					state,
					isDue,
				});
			} catch (error) {
				console.warn(
					`Ошибка преобразования карточки из WASM результата:`,
					error,
				);
				// Пропускаем карточки с ошибками преобразования
				continue;
			}
		}

		return cardsWithState;
	} catch (error) {
		console.error(
			`Ошибка фильтрации и сортировки карточек через WASM: ${String(error)}. Возвращаем пустой массив.`,
		);

		// В случае ошибки WASM, возвращаем пустой массив
		// В будущих версиях можно добавить fallback на старую реализацию
		return [];
	}
}

/**
 * Получает значение поля для сортировки (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */

/**
 * Сортирует scheduled карточки по дате due (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */

/**
 * Вычисляет состояния для массива карточек (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export async function computeCardsStates(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date,
): Promise<CardWithState[]> {
	console.warn(
		`Функция computeCardsStates устарела и используется только для обратной совместимости. Используйте WASM фильтрацию.`,
	);
	return [];
}

/**
 * Применяет дефолтную логику сортировки (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function applyDefaultSort(
	cardsWithState: CardWithState[],
	now: Date,
): CardWithState[] {
	console.warn(
		`Функция applyDefaultSort устарела и используется только для обратной совместимости. Используйте WASM фильтрацию.`,
	);
	return cardsWithState;
}

/**
 * Применяет пользовательскую сортировку (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function applyCustomSort(
	cards: CardWithState[],
	sort: SortParam,
	now: Date,
): CardWithState[] {
	console.warn(
		`Функция applyCustomSort устарела и используется только для обратной совместимости. Используйте WASM фильтрацию.`,
	);
	return cards;
}
