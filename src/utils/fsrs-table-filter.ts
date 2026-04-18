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
 * Преобразует вычисленные поля из WASM в ComputedCardState
 * @param wasmFields Вычисленные поля из WASM
 * @returns ComputedCardState
 */
function convertWasmFieldsToComputedState(
	wasmFields: WasmComputedFields,
): ComputedCardState {
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
export function getFieldValue(
	item: CardWithState,
	field: string,
	now: Date,
): string | number | Date {
	console.warn(
		`Функция getFieldValue устарела и используется только для обратной совместимости`,
	);

	switch (field) {
		case "file":
			return item.card.filePath || "";
		case "reps":
			return item.state.reps || 0;
		case "overdue": {
			// Вычисляем дни просрочки
			const dueDate = new Date(item.state.due || 0);
			const overdueMs = now.getTime() - dueDate.getTime();
			const overdueDays = Math.max(
				0,
				Math.floor(overdueMs / (1000 * 60 * 60 * 24)),
			);
			return overdueDays;
		}
		case "stability":
			return item.state.stability || 0;
		case "difficulty":
			return item.state.difficulty || 0;
		case "retrievability":
			return item.state.retrievability || 0;
		case "due":
			return new Date(item.state.due || 0);
		case "state":
			return item.state.state || "";
		case "elapsed":
			return item.state.elapsed_days || 0;
		case "scheduled":
			return item.state.scheduled_days || 0;
		default:
			console.warn(`Неизвестное поле для сортировки: ${field}`);
			return "";
	}
}

/**
 * Сортирует due карточки по приоритету (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function sortCardsForDue(
	cards: CardWithState[],
	now: Date,
): CardWithState[] {
	console.warn(
		`Функция sortCardsForDue устарела и используется только для обратной совместимости. Используйте WASM фильтрацию.`,
	);
	return cards;
}

/**
 * Сортирует scheduled карточки по дате due (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function sortScheduledCards(cards: CardWithState[]): CardWithState[] {
	console.warn(
		`Функция sortScheduledCards устарела и используется только для обратной совместимости. Используйте WASM фильтрацию.`,
	);
	return cards;
}

/**
 * Рассчитывает приоритет для сортировки due карточек (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function calculatePriorityScore(
	state: ComputedCardState,
	now: Date,
): number {
	console.warn(
		`Функция calculatePriorityScore устарела и используется только для обратной совместимости. Используйте WASM фильтрацию.`,
	);
	return 0;
}

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
