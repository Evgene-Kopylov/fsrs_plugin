/**
 * Модуль для генерации HTML таблицы блока fsrs-table
 * Создает HTML разметку таблицы на основе отфильтрованных и отсортированных карточек
 */

import type { App } from "obsidian";
import type { ModernFSRSCard, FSRSSettings } from "../interfaces/fsrs";
import type { TableParams, TableMode } from "./fsrs-table-params";
import type { CardWithState } from "./fsrs-table-filter";
import { formatDateTime } from "./date-format";
import { formatFieldValue } from "./fsrs-table-format";

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
	const limit =
		params.limit > 0 ? params.limit : settings.max_cards_to_show || 30;
	const cardsToShow = cardsWithState.slice(0, limit);
	const totalCards = cardsWithState.length;

	let html = `<div class="fsrs-table-container" data-mode="${params.mode}">`;

	// Заголовок таблицы
	const modeTitle = getModeTitle(params.mode);
	const formattedNow = formatDateTime(app, now);

	html += `<h4 class="fsrs-table-header">
		<span class="fsrs-header-text">${modeTitle}: ${totalCards}</span>
		<span class="fsrs-info-icon" title="Режим: ${params.mode}. Данные обновлены: ${formattedNow}">(?)</span>
	</h4>`;

	// Таблица
	html += `<table class="fsrs-table">`;

	// Заголовки колонок
	html += `<thead><tr>`;
	for (const column of params.columns) {
		const style = column.width ? ` style="width: ${column.width}"` : "";
		html += `<th class="fsrs-col-${column.field}"${style}>${column.title}</th>`;
	}
	html += `</tr></thead>`;

	// Тело таблицы
	html += `<tbody>`;
	for (const { card, state } of cardsToShow) {
		html += `<tr class="fsrs-table-row" data-file-path="${card.filePath}">`;

		for (const column of params.columns) {
			const value = formatFieldValue(
				column.field,
				card,
				state,
				app,
				now,
				params.mode,
			);
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
 * Генерирует HTML таблицы на основе исходных карточек
 * Вычисляет состояния, фильтрует и сортирует карточки, затем генерирует HTML
 * @param cards Исходные карточки
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
		params.mode,
		now,
	);

	return generateTableHTML(cardsWithState, params, settings, app, now);
}

/**
 * Возвращает заголовок таблицы в зависимости от режима
 * @param mode Режим отображения
 * @returns Заголовок таблицы
 */
function getModeTitle(mode: TableMode): string {
	switch (mode) {
		case "due":
			return "Карточек для повторения";
		case "future":
			return "Карточек на будущее";
		case "all":
			return "Всех карточек";
		default:
			return "Карточек";
	}
}

/**
 * Создает HTML для пустого состояния таблицы
 * @param mode Режим отображения
 * @returns HTML строка для пустого состояния
 */
export function generateEmptyTableHTML(mode: TableMode = "due"): string {
	const modeTitle = getModeTitle(mode);
	const message = getEmptyStateMessage(mode);

	return `<div class="fsrs-table-container" data-mode="${mode}">
		<h4 class="fsrs-table-header">
			<span class="fsrs-header-text">${modeTitle}: 0</span>
		</h4>
		<div class="fsrs-table-empty">
			<p>${message}</p>
		</div>
	</div>`;
}

/**
 * Возвращает сообщение для пустого состояния в зависимости от режима
 */
function getEmptyStateMessage(mode: TableMode): string {
	switch (mode) {
		case "due":
			return "Нет карточек для повторения. Все карточки изучены! 🎉";
		case "future":
			return "Нет карточек на будущее. Все карточки готовы к повторению или ещё не созданы.";
		case "all":
			return "Нет карточек FSRS. Используйте команду 'Добавить FSRS поля' для создания карточек.";
		default:
			return "Нет карточек для отображения.";
	}
}
