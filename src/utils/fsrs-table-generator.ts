/**
 * Модуль для генерации HTML таблицы блока fsrs-table
 * Создает HTML разметку таблицы на основе отфильтрованных и отсортированных карточек
 */

import type { App } from "obsidian";
import type { ModernFSRSCard, FSRSSettings } from "../interfaces/fsrs";
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
export function generateTableHTML(
	cardsWithState: CardWithState[],
	params: TableParams,
	settings: FSRSSettings,
	app: App,
	now: Date = new Date(),
): string {
	const limit = params.limit > 0 ? params.limit : 30;
	const cardsToShow = cardsWithState.slice(0, limit);
	const totalCards = cardsWithState.length;

	// Отладочный вывод для проверки колонок
	console.debug(
		`[FSRS] Генерация таблицы, колонок: ${params.columns.length}`,
	);
	params.columns.forEach((col, idx) => {
		console.debug(
			`[FSRS] Колонка ${idx}: field="${col.field}", title="${col.title}"`,
		);
	});

	let html = `<div class="fsrs-table-container">`;

	// Таблица
	html += `<table class="fsrs-table">`;

	// Заголовки колонок с поддержкой сортировки
	html += `<thead><tr>`;
	for (const column of params.columns) {
		console.debug(`[FSRS] Генерация заголовка для поля: ${column.field}`);
		const style = column.width ? ` style="width: ${column.width}"` : "";

		// Определяем текущую сортировку для этой колонки
		const isSorted = params.sort?.field === column.field;
		const currentDirection = isSorted ? params.sort!.direction : null;

		// Создаем заголовок с кликабельным элементом для сортировки
		html += `<th class="fsrs-col-${column.field} fsrs-sortable-header"${style}>`;
		html += `<div class="fsrs-sort-header" data-field="${column.field}" data-current-direction="${currentDirection || ""}">`;
		html += `<span class="fsrs-header-text">${column.title}</span>`;

		// Добавляем индикатор сортировки
		if (isSorted) {
			const arrow = currentDirection === "ASC" ? "↑" : "↓";
			html += `<span class="fsrs-sort-indicator">${arrow}</span>`;
		}

		html += `</div>`;
		html += `</th>`;
	}
	html += `</tr></thead>`;

	// Тело таблицы
	html += `<tbody>`;
	for (const { card, state, isDue } of cardsToShow) {
		// Добавляем класс для due карточек
		const rowClass = isDue
			? "fsrs-table-row fsrs-due-card"
			: "fsrs-table-row";
		html += `<tr class="${rowClass}" data-file-path="${card.filePath}">`;

		for (const column of params.columns) {
			console.debug(
				`[FSRS] Генерация ячейки для поля: ${column.field}, карточка: ${card.filePath}`,
			);
			const value = formatFieldValue(column.field, card, state, app, now);
			// Для поля file делаем ссылку
			if (column.field === "file") {
				html += `<td class="fsrs-col-${column.field}">
					<a href="${card.filePath}" data-file-path="${card.filePath}" class="internal-link">${value}</a>
				</td>`;
			} else {
				html += `<td class="fsrs-col-${column.field}">${value}</td>`;
			}
		}

		html += `</tr>`;
	}
	html += `</tbody></table>`;

	// Информация о лимите
	if (totalCards > limit) {
		const hiddenCount = totalCards - limit;
		html += `<div class="fsrs-table-info">
			<small>Показано: ${limit} из ${totalCards} карточек (${hiddenCount} скрыто)</small>
		</div>`;
	}

	html += `</div>`;
	return html;
}

/**
 * Генерирует HTML таблицу из массива карточек и параметров таблицы
 * Выполняет фильтрацию и сортировку перед генерацией HTML
 * @param cards Массив карточек FSRS
 * @param params Параметры таблицы
 * @param settings Настройки плагина
 * @param app Экземпляр приложения Obsidian
 * @param now Текущее время
 * @returns Promise с HTML строкой таблицы
 */
export async function generateTableHTMLFromCards(
	cards: ModernFSRSCard[],
	params: TableParams,
	settings: FSRSSettings,
	app: App,
	now: Date = new Date(),
): Promise<string> {
	// Импортируем функции динамически для избежания циклических зависимостей
	const { filterAndSortCards } = await import("./fsrs-table-filter");

	const cardsWithState = await filterAndSortCards(
		cards,
		settings,
		params,
		now,
	);

	return generateTableHTML(cardsWithState, params, settings, app, now);
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
export async function generateTableHTMLFromSql(
	cards: ModernFSRSCard[],
	sqlSource: string,
	settings: FSRSSettings,
	app: App,
	now: Date = new Date(),
): Promise<{ html: string; params: TableParams }> {
	// Парсим SQL для получения параметров таблицы
	const params = parseSqlBlock(sqlSource);
	console.debug("generateTableHTMLFromSql:", {
		cardCount: cards.length,
		sqlSource,
		params,
		hasWhere: !!params.where,
		hasSort: !!params.sort,
	});

	// Импортируем функцию фильтрации динамически для избежания циклических зависимостей
	const { filterAndSortCards } = await import("./fsrs-table-filter");

	const cardsWithState = await filterAndSortCards(
		cards,
		settings,
		params,
		now,
	);

	const html = generateTableHTML(cardsWithState, params, settings, app, now);
	return { html, params };
}
