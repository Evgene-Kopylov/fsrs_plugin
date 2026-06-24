/**
 * Модуль для генерации HTML таблицы блока fsrs-table
 * Создает HTML разметку таблицы на основе отфильтрованных и отсортированных карточек
 */

import { App, TFile, MarkdownView, type WorkspaceLeaf } from "obsidian";
import type {
    FSRSSettings,
    CardData,
    ComputedCardState,
} from "../interfaces/fsrs";
import type { TableParams } from "./fsrs-table-params";

import { formatFieldValue } from "./fsrs-table-format";
import { i18n } from "./i18n";
import { DEFAULT_TABLE_DISPLAY_LIMIT } from "../constants";

// ---------------------------------------------------------------------------
// Открытие файла в соседний видимый markdown-лиф
// ---------------------------------------------------------------------------

/** Последние активные лифы: [самый свежий, предыдущий]. */
const lastLeaves: WorkspaceLeaf[] = [];

function isSidebarLeaf(leaf: WorkspaceLeaf): boolean {
    if (!leaf.view) return true; // Уничтоженный лиф — исключаем
    return leaf.view.containerEl.closest(".mod-root") === null;
}

function isLeafHidden(leaf: WorkspaceLeaf): boolean {
    if (!leaf.view) return true;
    return leaf.view.containerEl.offsetParent === null;
}

/** Вызывается из main.ts при active-leaf-change */
export function trackActiveLeaf(leaf: WorkspaceLeaf | null): void {
    if (!leaf) return;
    const idx = lastLeaves.indexOf(leaf);
    if (idx !== -1) lastLeaves.splice(idx, 1);
    lastLeaves.unshift(leaf);
    if (lastLeaves.length > 2) lastLeaves.pop();
}

function pruneLastLeaves(): void {
    for (let i = lastLeaves.length - 1; i >= 0; i--) {
        if (!lastLeaves[i]?.view) lastLeaves.splice(i, 1);
    }
}

function isValidTarget(
    leaf: WorkspaceLeaf,
    currentLeaf: WorkspaceLeaf | undefined,
): boolean {
    return (
        leaf !== currentLeaf &&
        !isSidebarLeaf(leaf) &&
        !isLeafHidden(leaf) &&
        leaf.view?.getViewType() === "markdown"
    );
}

function findTargetLeaf(
    app: App,
    currentLeaf: WorkspaceLeaf | undefined,
): WorkspaceLeaf | undefined {
    // 1. Предыдущий активный markdown-лиф (lastLeaves[1])
    const prev = lastLeaves.length > 1 ? lastLeaves[1] : undefined;
    if (prev && isValidTarget(prev, currentLeaf)) return prev;

    // 2. Пустой лиф
    const emptyLeaf = app.workspace
        .getLeavesOfType("empty")
        .find(
            (l) => l !== currentLeaf && !isSidebarLeaf(l) && !isLeafHidden(l),
        );
    if (emptyLeaf) return emptyLeaf;

    // 3. Любой markdown-лиф
    const mdLeaf = app.workspace
        .getLeavesOfType("markdown")
        .find(
            (l) => l !== currentLeaf && !isSidebarLeaf(l) && !isLeafHidden(l),
        );
    if (mdLeaf) return mdLeaf;

    // 4. Любой видимый не-сайдбарный лиф
    const all: WorkspaceLeaf[] = [];
    app.workspace.iterateAllLeaves((l) => all.push(l));
    return all.find(
        (l) => l !== currentLeaf && !isSidebarLeaf(l) && !isLeafHidden(l),
    );
}

// ---------------------------------------------------------------------------
// Внутренний тип для карточки с состоянием
// ---------------------------------------------------------------------------

interface CardWithState {
    card: CardData;
    state: ComputedCardState;
    isDue: boolean;
}

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
    parentEl: HTMLElement,
    cardsWithState: CardWithState[],
    totalCount: number,
    params: TableParams,
    _settings: FSRSSettings,
    app: App,
    now: Date = new Date(),
): HTMLDivElement {
    const effectiveLimit =
        params.limit > 0 ? params.limit : DEFAULT_TABLE_DISPLAY_LIMIT;
    const cardsToShow = cardsWithState.slice(0, effectiveLimit);
    const totalCards = totalCount;

    const container = createDiv();
    container.className = "fsrs-table-container";

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

    for (const { card, state, isDue } of cardsToShow) {
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
                column.date_format,
            );
            const td = createEl("td");
            td.className = `fsrs-col-${column.field}`;

            if (column.field === "file") {
                const link = createEl("a");
                link.href = card.filePath;
                link.dataset.href = card.filePath;
                link.dataset.filePath = card.filePath;
                link.className = "internal-link";
                link.textContent = value;
                link.addEventListener("click", (e) => {
                    // Ctrl+Click / Cmd+Click — стандартное поведение Obsidian
                    if (e.ctrlKey || e.metaKey) return;

                    pruneLastLeaves();

                    const currentLeaf =
                        app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
                    const targetLeaf = findTargetLeaf(app, currentLeaf);
                    const leaf = targetLeaf ?? currentLeaf;
                    if (!leaf) return;

                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const file = app.vault.getAbstractFileByPath(card.filePath);
                    if (file instanceof TFile) {
                        app.workspace.setActiveLeaf(leaf, { focus: true });
                        void leaf.openFile(file);
                    }
                });
                td.appendChild(link);
            } else {
                td.textContent = value;
            }

            row.appendChild(td);
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

    // Вставляем в DOM готовую таблицу — один replaceChildren вместо empty+appendChild (меньше reflow)
    parentEl.replaceChildren(container);

    return container;
}
