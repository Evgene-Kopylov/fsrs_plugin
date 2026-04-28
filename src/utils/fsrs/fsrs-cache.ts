/**
 * Тонкая обёртка над WASM-функциями кэша карточек FSRS.
 *
 * Класс не хранит состояние в TypeScript — все данные находятся в глобальном
 * кэше внутри WASM (Rust). TS только вызывает WASM-функции и парсит JSON.
 *
 * Используется для:
 * - Инкрементального сканирования карточек (addOrUpdateCards)
 * - Быстрых запросов к таблицам (query, queryCount)
 * - Обработки событий файловой системы (removeCard)
 * - Отладки (getAll, size)
 */

import type {
	ModernFSRSCard,
	ComputedCardState,
	CachedCard,
} from "../../interfaces/fsrs";
import type { TableParams } from "../../utils/fsrs-table-params";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

// ---------------------------------------------------------------------------
// Вспомогательные типы
// ---------------------------------------------------------------------------

/** Элемент входного массива для addOrUpdateCards */
export interface CacheCardInput {
	filePath: string;
	card: ModernFSRSCard;
	state: ComputedCardState;
}

/** Результат addOrUpdateCards */
export interface CacheUpdateResult {
	updated: number;
	errors: string[];
}

/** Результат removeCard */
export interface CacheRemoveResult {
	removed: boolean;
	reason?: string;
}

/** Результат query_cards из WASM */
export interface QueryResult {
	cards: CachedCard[];
	total_count: number;
	errors: string[];
}

/** Результат query_cards_count из WASM */
export interface CountResult {
	total_count: number;
	errors: string[];
}

// ---------------------------------------------------------------------------
// FsrsCache
// ---------------------------------------------------------------------------

export class FsrsCache {
	/**
	 * Инициализирует / очищает кэш в WASM.
	 * Безопасно вызывать многократно.
	 */
	init(): void {
		wasm.init_cache();
	}

	/**
	 * Полностью очищает кэш.
	 */
	clear(): void {
		wasm.clear_cache();
	}

	/**
	 * Возвращает количество карточек в кэше.
	 */
	size(): number {
		return wasm.get_cache_size();
	}

	/**
	 * Пакетное добавление или обновление карточек.
	 *
	 * @param cards — массив карточек с состояниями
	 * @returns количество обновлённых и ошибки
	 */
	addOrUpdateCards(cards: CacheCardInput[]): CacheUpdateResult {
		// Сериализуем каждую карточку в формат, ожидаемый WASM
		const input = cards.map((c) => ({
			filePath: c.filePath,
			card_json: JSON.stringify({ reviews: c.card.reviews }),
			state_json: JSON.stringify(c.state),
		}));

		const resultJson = wasm.add_or_update_cards(JSON.stringify(input));
		return JSON.parse(resultJson) as CacheUpdateResult;
	}

	/**
	 * Удаляет карточку из кэша по пути файла.
	 *
	 * @param filePath — путь к файлу
	 * @returns результат удаления
	 */
	removeCard(filePath: string): CacheRemoveResult {
		const resultJson = wasm.remove_card(filePath);
		return JSON.parse(resultJson) as CacheRemoveResult;
	}

	/**
	 * Запрашивает карточки с фильтрацией, сортировкой и лимитом.
	 *
	 * @param params — параметры таблицы
	 * @param now — текущее время (для вычисления полей)
	 * @returns отфильтрованные карточки и общее количество
	 */
	query(params: TableParams, now: Date = new Date()): QueryResult {
		// Преобразуем TableParams в формат, ожидаемый Rust
		// (поле `where` → `where_condition`)
		const rustParams = this.toRustParams(params);
		const resultJson = wasm.query_cards(
			JSON.stringify(rustParams),
			now.toISOString(),
		);
		return JSON.parse(resultJson) as QueryResult;
	}

	/**
	 * Запрашивает только количество карточек по параметрам.
	 * Быстрее, чем `query`, так как не возвращает карточки.
	 *
	 * @param params — параметры таблицы
	 * @param now — текущее время
	 * @returns количество и ошибки
	 */
	queryCount(params: TableParams, now: Date = new Date()): CountResult {
		const rustParams = this.toRustParams(params);
		const resultJson = wasm.query_cards_count(
			JSON.stringify(rustParams),
			now.toISOString(),
		);
		return JSON.parse(resultJson) as CountResult;
	}

	/**
	 * Возвращает все карточки из кэша (для отладки).
	 */
	getAll(): CachedCard[] {
		const resultJson = wasm.get_all_cards();
		return JSON.parse(resultJson) as CachedCard[];
	}

	// -----------------------------------------------------------------------
	// Приватные методы
	// -----------------------------------------------------------------------

	/**
	 * Преобразует TableParams (TS-формат) в формат, ожидаемый Rust.
	 *
	 * В TS поле фильтрации называется `where`,
	 * в Rust — `where_condition` (через serde rename).
	 */
	private toRustParams(params: TableParams): Record<string, unknown> {
		const rustParams: Record<string, unknown> = {
			columns: params.columns,
			limit: params.limit,
		};

		if (params.sort) {
			rustParams.sort = params.sort;
		}

		// Преобразуем `where` → `where_condition`
		if (params.where !== undefined) {
			rustParams.where_condition = params.where;
		}

		return rustParams;
	}
}
