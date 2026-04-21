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
    params: TableParams,
    _settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): HTMLDivElement {
    const limit = params.limit > 0 ? params.limit : 30;
    const cardsToShow = cardsWithState.slice(0, limit);
    const totalCards = cardsWithState.length;

    // Отладочный вывод для проверки колонок
    console.debug(
        `[FSRS] Генерация DOM таблицы, колонок: ${params.columns.length}`,
    );
    params.columns.forEach((col, idx) => {
        console.debug(
            `[FSRS] Колонка ${idx}: field="${col.field}", title="${col.title}"`,
        );
    });

    const container = document.createElement("div");
    container.className = "fsrs-table-container";

    // Таблица
    const table = document.createElement("table");
    table.className = "fsrs-table";
    container.appendChild(table);

    // Заголовки колонок с поддержкой сортировки
    const thead = document.createElement("thead");
    table.appendChild(thead);
    const headerRow = document.createElement("tr");
    thead.appendChild(headerRow);

    for (const column of params.columns) {
        console.debug(`[FSRS] Генерация заголовка для поля: ${column.field}`);
        const th = document.createElement("th");
        th.className = `fsrs-col-${column.field} fsrs-sortable-header`;
        if (column.width) {
            th.style.width = column.width;
        }

        // Определяем текущую сортировку для этой колонки
        const isSorted = params.sort?.field === column.field;
        const currentDirection = isSorted ? params.sort!.direction : null;

        // Создаем заголовок с кликабельным элементом для сортировки
        const sortHeader = document.createElement("div");
        sortHeader.className = "fsrs-sort-header";
        sortHeader.dataset.field = column.field;
        sortHeader.dataset.currentDirection = currentDirection || "";

        const headerText = document.createElement("span");
        headerText.className = "fsrs-header-text";
        headerText.textContent = column.title;
        sortHeader.appendChild(headerText);

        // Добавляем индикатор сортировки
        if (isSorted) {
            const sortIndicator = document.createElement("span");
            sortIndicator.className = "fsrs-sort-indicator";
            sortIndicator.textContent = currentDirection === "ASC" ? "↑" : "↓";
            sortHeader.appendChild(sortIndicator);
        }

        th.appendChild(sortHeader);
        headerRow.appendChild(th);
    }

    // Тело таблицы
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    for (const { card, state, isDue } of cardsToShow) {
        // Добавляем класс для due карточек
        const row = document.createElement("tr");
        row.className = isDue
            ? "fsrs-table-row fsrs-due-card"
            : "fsrs-table-row";
        row.dataset.filePath = card.filePath;
        tbody.appendChild(row);

        for (const column of params.columns) {
            console.debug(
                `[FSRS] Генерация ячейки для поля: ${column.field}, карточка: ${card.filePath}`,
            );
            const value = formatFieldValue(column.field, card, state, app, now);
            const td = document.createElement("td");
            td.className = `fsrs-col-${column.field}`;

            // Для поля file делаем ссылку
            if (column.field === "file") {
                const link = document.createElement("a");
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
    if (totalCards > limit) {
        const hiddenCount = totalCards - limit;
        const infoDiv = document.createElement("div");
        infoDiv.className = "fsrs-table-info";
        const small = document.createElement("small");
        small.textContent = `Показано: ${limit} из ${totalCards} карточек (${hiddenCount} скрыто)`;
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
): Promise<HTMLDivElement> {
    const { filterAndSortCardsWithStates } =
        await import("./fsrs-table-filter");

    const cardsWithState = await filterAndSortCardsWithStates(
        cachedCards,
        settings,
        params,
        now,
    );

    return generateTableDOM(cardsWithState, params, settings, app, now);
}

export async function generateTableDOMFromSql(
    cards: ModernFSRSCard[],
    sqlSource: string,
    settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): Promise<{ container: HTMLDivElement; params: TableParams }> {
    const params = parseSqlBlock(sqlSource);
    console.debug("generateTableDOMFromSql:", {
        cardCount: cards.length,
        sqlSource,
        params,
        hasSort: !!params.sort,
    });

    const { filterAndSortCards } = await import("./fsrs-table-filter");

    const cardsWithState = await filterAndSortCards(
        cards,
        settings,
        params,
        now,
    );

    const container = generateTableDOM(
        cardsWithState,
        params,
        settings,
        app,
        now,
    );
    return { container, params };
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
