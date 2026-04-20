/**
 * Модуль для фильтрации и сортировки карточек блока fsrs-table
 * Использует WASM реализацию на Rust для максимальной производительности и совместимости
 */

import type {
	ModernFSRSCard,
	ComputedCardState,
	CachedCard,
	FSRSSettings,
	FSRSState,
} from "../interfaces/fsrs";
import type { TableParams } from "./fsrs-table-params";

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

	// Отладочный вывод параметров
	console.debug("filterAndSortCards parameters:", {
		cardCount: cards.length,
		params: JSON.parse(JSON.stringify(params)) as unknown,
		hasSort: !!params.sort,
		limit: params.limit,
		now: now.toISOString(),
	});

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
				: {
						field: "overdue",
						direction: "DESC",
					},
			where_condition: params.where,
		};

		// Отладочный вывод параметров для WASM
		console.debug("WASM parameters for filter_and_sort_cards:", {
			wasmParams: JSON.parse(JSON.stringify(wasmParams)) as unknown,
			whereCondition: wasmParams.where_condition,
		});

		// Вызываем WASM функцию для фильтрации и сортировки
		const resultJson = wasm.filter_and_sort_cards(
			JSON.stringify(cards),
			JSON.stringify(wasmParams),
			JSON.stringify(settings),
			now.toISOString(),
		);

		console.debug(
			"WASM filter_and_sort_cards result JSON length:",
			resultJson.length,
		);

		// Парсим результат с явным приведением типов
		const wasmResult: WasmFilterResult = JSON.parse(
			resultJson,
		) as unknown as WasmFilterResult;

		console.debug("WASM filter result:", {
			totalCards: wasmResult.cards?.length || 0,
			totalCount: wasmResult.total_count,
			errorCount: wasmResult.errors?.length || 0,
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
				// Парсим карточку из JSON с явным приведением типов
				const card: ModernFSRSCard = JSON.parse(
					wasmCard.card_json,
				) as unknown as ModernFSRSCard;

				// Отладочная информация о карточке
				console.debug("Processing card:", {
					file: card.filePath,
					reviewsCount: card.reviews?.length || 0,
					computedFields: wasmCard.computed_fields,
				});

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

		return [];
	}
}

/**
 * Фильтрует и сортирует карточки с готовыми состояниями в соответствии с параметрами
 * Использует WASM реализацию на Rust для максимальной производительности
 * @param cachedCards Массив карточек с кэшированными состояниями
 * @param settings Настройки плагина
 * @param params Параметры таблицы (сортировка и лимит)
 * @param now Текущее время
 * @returns Отфильтрованный и отсортированный массив карточек с состояниями
 */
export async function filterAndSortCardsWithStates(
	cachedCards: CachedCard[],
	settings: FSRSSettings,
	params: TableParams,
	now: Date = new Date(),
): Promise<CardWithState[]> {
	if (!cachedCards || cachedCards.length === 0) {
		return [];
	}

	// Отладочный вывод параметров
	console.debug("filterAndSortCardsWithStates parameters:", {
		cachedCardCount: cachedCards.length,
		params: JSON.parse(JSON.stringify(params)) as unknown,
		hasSort: !!params.sort,
		limit: params.limit,
		now: now.toISOString(),
	});

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
				: {
						field: "overdue",
						direction: "DESC",
					},
			where_condition: params.where,
		};

		// Отладочный вывод параметров для WASM
		console.debug(
			"WASM parameters for filter_and_sort_cards_with_states:",
			{
				wasmParams: JSON.parse(JSON.stringify(wasmParams)) as unknown,
				whereCondition: wasmParams.where_condition,
			},
		);

		// Формируем массив объектов {card_json, state_json} для WASM
		const cardsWithStatesInput = cachedCards.map(({ card, state }) => ({
			card_json: JSON.stringify(card),
			state_json: JSON.stringify(state),
		}));

		// Вызываем WASM функцию для фильтрации и сортировки с готовыми состояниями
		const resultJson = wasm.filter_and_sort_cards_with_states(
			JSON.stringify(cardsWithStatesInput),
			JSON.stringify(wasmParams),
			JSON.stringify(settings),
			now.toISOString(),
		);

		console.debug(
			"WASM filter_and_sort_cards_with_states result JSON length:",
			resultJson.length,
		);

		// Парсим результат с явным приведением типов
		const wasmResult: WasmFilterResult = JSON.parse(
			resultJson,
		) as unknown as WasmFilterResult;

		console.debug("WASM filter result with states:", {
			totalCards: wasmResult.cards?.length || 0,
			totalCount: wasmResult.total_count,
			errorCount: wasmResult.errors?.length || 0,
		});

		// Обрабатываем ошибки, если есть
		if (wasmResult.errors && wasmResult.errors.length > 0) {
			console.warn(
				`При фильтрации и сортировке карточек с состояниями возникли ошибки:`,
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

				// Отладочная информация о карточке
				console.debug("Processing card with precomputed state:", {
					file: card.filePath,
					reviewsCount: card.reviews?.length || 0,
					computedFields: wasmCard.computed_fields,
				});

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
			`Ошибка фильтрации и сортировки карточек с состояниями через WASM: ${String(error)}. Возвращаем пустой массив.`,
		);

		// В случае ошибки WASM, возвращаем пустой массив
		return [];
	}
}
