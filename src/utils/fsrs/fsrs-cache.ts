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
    FSRSState,
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
// Внутренние типы для преобразования WASM → TS
// ---------------------------------------------------------------------------

/**
 * Формат вычисленных полей, возвращаемых WASM query_cards.
 */
interface WasmComputedFields {
    file?: string;
    reps?: number;
    overdue?: number;
    stability?: number;
    difficulty?: number;
    retrievability?: number;
    due?: string;
    state?: string;
    elapsed?: number;
    scheduled?: number;
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
        const rustParams = this.toRustParams(params);
        const resultJson = wasm.query_cards(
            JSON.stringify(rustParams),
            now.toISOString(),
        );
        return this.normalizeQueryResult(resultJson, now);
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
     * Преобразует сырой JSON-результат WASM query_cards в QueryResult
     * с карточками в формате CachedCard[].
     *
     * WASM возвращает { card_json: string, computed_fields: {...} },
     * а TS ожидает { card: ModernFSRSCard, state: ComputedCardState }.
     */
    private normalizeQueryResult(resultJson: string, now: Date): QueryResult {
        const raw = JSON.parse(resultJson) as {
            cards: Array<{
                card_json: string;
                computed_fields: WasmComputedFields;
            }>;
            total_count: number;
            errors: string[];
        };

        const cards: CachedCard[] = raw.cards.map((item) => ({
            card: JSON.parse(item.card_json) as ModernFSRSCard,
            state: this.wasmFieldsToState(item.computed_fields, now),
        }));

        return { cards, total_count: raw.total_count, errors: raw.errors };
    }

    /**
     * Преобразует вычисленные поля из WASM в ComputedCardState.
     */
    private wasmFieldsToState(
        fields: WasmComputedFields,
        _now: Date,
    ): ComputedCardState {
        // Преобразуем дату из формата Obsidian (ГГГГ-ММ-ДД_чч:мм) в ISO
        let dueDate = "";
        if (fields.due) {
            const parts = fields.due.split("_");
            if (parts.length === 2) {
                dueDate = `${parts[0]}T${parts[1]}:00.000Z`;
            }
        }

        return {
            due: dueDate,
            overdue: fields.overdue ?? 0,
            stability: fields.stability || 0,
            difficulty: fields.difficulty || 0,
            state: this.normalizeState(fields.state),
            elapsed_days: fields.elapsed || 0,
            scheduled_days: fields.scheduled || 0,
            reps: fields.reps || 0,
            lapses: 0,
            retrievability: fields.retrievability || 0,
        };
    }

    /**
     * Приводит строку состояния из WASM к FSRSState.
     */
    private normalizeState(wasmState?: string): FSRSState {
        if (!wasmState) return "New";
        const map: Record<string, FSRSState> = {
            new: "New",
            learning: "Learning",
            review: "Review",
            relearning: "Relearning",
            due: "Review",
        };
        return map[wasmState.toLowerCase()] ?? "New";
    }

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
