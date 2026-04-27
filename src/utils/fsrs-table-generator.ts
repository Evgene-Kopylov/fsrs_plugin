/**
 * Модуль для генерации HTML таблицы блока fsrs-table
 * Создает HTML разметку таблицы на основе отфильтрованных и отсортированных карточек
 */

import type { App } from "obsidian";
import type {
    ModernFSRSCard,
    FSRSSettings,
    CachedCard,
} from "../interfaces/fsrs";
import type { TableParams } from "./fsrs-table-params";
import type { CardWithState } from "./fsrs-table-filter";

import { formatFieldValue } from "./fsrs-table-format";
import { i18n } from "./i18n";
import { parseSqlBlock } from "./fsrs-table-params";

/**
 * Генерирует HTML таблицы для блока fsrs-table
 * @param cardsWithState Карточки с состояниями
 * @param params Параметры таблицы
 * @param settings Настройки плагина
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns HTML строка таблицы
 */

/**
 * Генерирует DOM таблицы для блока fsrs-table безопасным способом
 * Создает DOM элементы через createElement, избегая innerHTML
 * @param cardsWithState Карточки с состояниями
 * @param params Параметры таблицы
 * @param settings Настройки плагина
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns HTMLDivElement контейнер таблицы
 */
export function generateTableDOM(
    cardsWithState: CardWithState[],
    totalCount: number,
    params: TableParams,
    _settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): HTMLDivElement {
    const cardsToShow = cardsWithState; // WASM уже применил лимит
    const totalCards = totalCount;

    const container = activeDocument.createDiv();
    container.className = "fsrs-table-container";

    // Таблица
    const table = activeDocument.createEl("table");
    table.className = "fsrs-table";
    container.appendChild(table);

    // Заголовки колонок с поддержкой сортировки
    const thead = activeDocument.createEl("thead");
    table.appendChild(thead);
    const headerRow = activeDocument.createEl("tr");
    thead.appendChild(headerRow);

    for (const column of params.columns) {
        const th = activeDocument.createEl("th");
        th.className = `fsrs-col-${column.field} fsrs-sortable-header`;
        if (column.width) {
            th.style.width = column.width;
        }

        // Определяем текущую сортировку для этой колонки
        const isSorted = params.sort?.field === column.field;
        const currentDirection = isSorted ? params.sort!.direction : null;

        // Создаем заголовок с кликабельным элементом для сортировки
        const sortHeader = activeDocument.createDiv();
        sortHeader.className = "fsrs-sort-header";
        sortHeader.dataset.field = column.field;
        sortHeader.dataset.currentDirection = currentDirection || "";

        const headerText = activeDocument.createSpan();
        headerText.className = "fsrs-header-text";
        headerText.textContent = column.title;
        sortHeader.appendChild(headerText);

        // Добавляем индикатор сортировки
        if (isSorted) {
            const sortIndicator = activeDocument.createSpan();
            sortIndicator.className = "fsrs-sort-indicator";
            sortIndicator.textContent = currentDirection === "ASC" ? "↑" : "↓";
            sortHeader.appendChild(sortIndicator);
        }

        th.appendChild(sortHeader);
        headerRow.appendChild(th);
    }

    // Тело таблицы
    const tbody = activeDocument.createEl("tbody");
    table.appendChild(tbody);

    for (const { card, state, isDue } of cardsToShow) {
        // Добавляем класс для due карточек
        const row = activeDocument.createEl("tr");
        row.className = isDue
            ? "fsrs-table-row fsrs-due-card"
            : "fsrs-table-row";
        row.dataset.filePath = card.filePath;
        tbody.appendChild(row);

        for (const column of params.columns) {
            const value = formatFieldValue(column.field, card, state, app, now);
            const td = activeDocument.createEl("td");
            td.className = `fsrs-col-${column.field}`;

            // Для поля file делаем ссылку
            if (column.field === "file") {
                const link = activeDocument.createEl("a");
                link.href = card.filePath;
                link.dataset.filePath = card.filePath;
                link.className = "internal-link";
                link.textContent = value;
                td.appendChild(link);
            } else {
                td.textContent = value;
            }

            row.appendChild(td);
        }
    }

    // Информация о лимите
    if (totalCards > cardsWithState.length) {
        const hiddenCount = totalCards - cardsWithState.length;
        const infoDiv = activeDocument.createDiv();
        infoDiv.className = "fsrs-table-info";
        const small = activeDocument.createEl("small");
        small.textContent = i18n.t("table.showing_limit", {
            shown: cardsWithState.length,
            total: totalCards,
            hidden: hiddenCount,
        });
        infoDiv.appendChild(small);
        container.appendChild(infoDiv);
    }

    return container;
}

/**
 * Генерирует HTML таблицу из массива карточек с состояниями и параметров таблицы
 * Выполняет фильтрацию и сортировку перед генерацией HTML
 * @param cachedCards Массив карточек FSRS с кэшированными состояниями
 * @param params Параметры таблицы
 * @param settings Настройки плагина
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns Promise с HTML строкой таблицы
 */

export async function generateTableDOMFromCards(
    cachedCards: CachedCard[],
    params: TableParams,
    settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): Promise<{
    container: HTMLDivElement;
    cards: CardWithState[];
    totalCount: number;
}> {
    const { filterAndSortCardsWithStates } =
        await import("./fsrs-table-filter");

    const { cards, totalCount } = filterAndSortCardsWithStates(
        cachedCards,
        settings,
        params,
        now,
    );

    const container = generateTableDOM(
        cards,
        totalCount,
        params,
        settings,
        app,
        now,
    );
    return { container, cards, totalCount };
}

export async function generateTableDOMFromSql(
    cards: ModernFSRSCard[],
    sqlSource: string,
    settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): Promise<{
    container: HTMLDivElement;
    params: TableParams;
    cards: CardWithState[];
    totalCount: number;
}> {
    const params = parseSqlBlock(sqlSource);

    const { filterAndSortCards } = await import("./fsrs-table-filter");

    const { cards: cardsWithState, totalCount } = filterAndSortCards(
        cards,
        settings,
        params,
        now,
    );

    const container = generateTableDOM(
        cardsWithState,
        totalCount,
        params,
        settings,
        app,
        now,
    );
    return { container, params, cards: cardsWithState, totalCount };
}

/**
 * Генерирует HTML таблицу из массива карточек и SQL-запроса
 * Выполняет фильтрацию и сортировку перед генерацией HTML
 * @param cards Массив карточек FSRS
 * @param sqlSource SQL-подобный запрос для фильтрации и сортировки
 * @param settings Настройки плагина
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns Promise с объектом содержащим HTML строку таблицы и параметры
 */
