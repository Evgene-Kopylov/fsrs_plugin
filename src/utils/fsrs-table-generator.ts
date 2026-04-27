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
export async function generateTableDOM(
    parentEl: HTMLElement,
    cardsWithState: CardWithState[],
    totalCount: number,
    params: TableParams,
    _settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): Promise<HTMLDivElement> {
    const CHUNK_SIZE = 50;
    const effectiveLimit = params.limit > 0 ? params.limit : 200;
    const cardsToShow = cardsWithState.slice(0, effectiveLimit);
    const totalCards = totalCount;

    const container = createDiv();
    container.className = "fsrs-table-container";

    // Сразу вставляем в DOM, чтобы браузер отрисовывал строки между чанками
    parentEl.empty();
    parentEl.appendChild(container);

    // Таблица
    const table = createEl("table");
    table.className = "fsrs-table";
    container.appendChild(table);

    // Заголовки колонок с поддержкой сортировки
    const thead = createEl("thead");
    table.appendChild(thead);
    const headerRow = createEl("tr");
    thead.appendChild(headerRow);

    for (const column of params.columns) {
        const th = createEl("th");
        th.className = `fsrs-col-${column.field} fsrs-sortable-header`;
        if (column.width) {
            th.style.width = column.width;
        }

        // Определяем текущую сортировку для этой колонки
        const isSorted = params.sort?.field === column.field;
        const currentDirection = isSorted ? params.sort!.direction : null;

        // Создаем заголовок с кликабельным элементом для сортировки
        const sortHeader = createDiv();
        sortHeader.className = "fsrs-sort-header";
        sortHeader.dataset.field = column.field;
        sortHeader.dataset.currentDirection = currentDirection || "";

        const headerText = createSpan();
        headerText.className = "fsrs-header-text";
        headerText.textContent = column.title;
        sortHeader.appendChild(headerText);

        // Добавляем индикатор сортировки
        if (isSorted) {
            const sortIndicator = createSpan();
            sortIndicator.className = "fsrs-sort-indicator";
            sortIndicator.textContent = currentDirection === "ASC" ? "↑" : "↓";
            sortHeader.appendChild(sortIndicator);
        }

        th.appendChild(sortHeader);
        headerRow.appendChild(th);
    }

    // Тело таблицы
    const tbody = createEl("tbody");
    table.appendChild(tbody);

    for (let i = 0; i < cardsToShow.length; i += CHUNK_SIZE) {
        const chunk = cardsToShow.slice(i, i + CHUNK_SIZE);

        for (const { card, state, isDue } of chunk) {
            const row = createEl("tr");
            row.className = isDue
                ? "fsrs-table-row fsrs-due-card"
                : "fsrs-table-row";
            row.dataset.filePath = card.filePath;
            tbody.appendChild(row);

            for (const column of params.columns) {
                const value = formatFieldValue(
                    column.field,
                    card,
                    state,
                    app,
                    now,
                );
                const td = createEl("td");
                td.className = `fsrs-col-${column.field}`;

                if (column.field === "file") {
                    const link = createEl("a");
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

        // Отдаём управление браузеру между чанками
        if (i + CHUNK_SIZE < cardsToShow.length) {
            // Отдаём управление браузеру для отрисовки добавленных строк
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    // Информация о лимите
    if (totalCards > cardsToShow.length) {
        const hiddenCount = totalCards - cardsToShow.length;
        const infoDiv = createDiv();
        infoDiv.className = "fsrs-table-info";
        const small = createEl("small");
        small.textContent = i18n.t("table.showing_limit", {
            shown: cardsToShow.length,
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
    parentEl: HTMLElement,
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

    const container = await generateTableDOM(
        parentEl,
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
    parentEl: HTMLElement,
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

    const container = await generateTableDOM(
        parentEl,
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
