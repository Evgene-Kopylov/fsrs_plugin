// Генерация HTML для табличного отображения карточек FSRS в блоке fsrs-now

import type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
} from "../../interfaces/fsrs";
import { computeCardState } from "./fsrs-wasm";
import { getOverdueHours, formatOverdueTime } from "./fsrs-time";

/**
 * Извлекает имя файла из пути
 */
function extractFileName(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1] || filePath;
}

/**
 * Создает отображаемое имя для карточки
 * Убирает расширение .md и форматирует для отображения
 */
function extractDisplayName(filePath: string): string {
	const fileName = extractFileName(filePath);
	return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}

/**
 * Заглушка для обратной совместимости (используется в других местах плагина)
 */
export function generateCardHTML(
	card: ModernFSRSCard,
	computedState: ComputedCardState,
	index: number,
	settings: FSRSSettings,
	now: Date = new Date(),
): string {
	// Возвращаем пустую строку, так как карточки теперь отображаются таблицей
	// Эта функция остается для совместимости с другими частями кода
	return "";
}

/**
 * Генерирует HTML таблицы для списка карточек
 */
export async function generateFsrsNowHTML(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<string> {
	const maxCardsToShow = settings.max_cards_to_show || 30;
	const cardsToShow = cards.slice(0, maxCardsToShow);

	// Для каждой карточки заранее получаем computedState (асинхронно)
	const cardsWithState: { card: ModernFSRSCard; state: ComputedCardState }[] =
		[];
	for (const card of cardsToShow) {
		try {
			const state = await computeCardState(card, settings, now);
			cardsWithState.push({ card, state });
		} catch (error) {
			console.error(
				`Ошибка вычисления состояния для ${card.filePath}:`,
				error,
			);
			// Добавляем fallback-состояние
			cardsWithState.push({
				card,
				state: {
					due: now.toISOString(),
					stability: 0,
					difficulty: 0,
					state: "Review",
					elapsed_days: 0,
					scheduled_days: 0,
					reps: 0,
					lapses: 0,
					retrievability: 0,
				},
			});
		}
	}

	let html = `<div class="fsrs-now-container">`;
	html += `<h4>Карточки для повторения (${cards.length})</h4>`;
	html += `<small>Обновлено: ${now.toLocaleString()}</small><br><br>`;

	// Начинаем таблицу
	html += `<table class="fsrs-now-table">`;
	html += `<thead>`;
	html += `<tr>`;
	html += `<th>#</th>`;
	html += `<th>Файл</th>`;
	html += `<th>Повторений</th>`;
	html += `<th>Просрочка</th>`;

	// Колонки со статистикой показываются в зависимости от настроек
	if (settings.show_stability) {
		html += `<th>Стабильность</th>`;
	}
	if (settings.show_difficulty) {
		html += `<th>Сложность</th>`;
	}
	// Извлекаемость пока не добавляем в таблицу для компактности
	// if (settings.show_retrievability) { ... }

	html += `<th>Дата повторения</th>`;
	html += `</tr>`;
	html += `</thead>`;
	html += `<tbody>`;

	// Заполняем строки таблицы
	for (let i = 0; i < cardsWithState.length; i++) {
		const cardState = cardsWithState[i];
		if (!cardState) continue;
		const { card, state } = cardState;
		const displayName = extractDisplayName(card.filePath);
		const overdueHours = getOverdueHours(new Date(state.due), now);
		const overdueText = formatOverdueTime(overdueHours);
		const dueDate = new Date(state.due);
		const dueDateStr = dueDate.toLocaleString();

		html += `<tr class="fsrs-now-row" data-file-path="${card.filePath}">`;
		html += `<td>${i + 1}</td>`;
		// Ссылка на файл
		html += `<td><a href="${card.filePath}" data-file-path="${card.filePath}" class="internal-link">${displayName}</a></td>`;
		html += `<td>${card.reviews.length}</td>`;
		html += `<td>${overdueText}</td>`;

		// Колонки статистики
		if (settings.show_stability) {
			html += `<td>${state.stability.toFixed(2)}</td>`;
		}
		if (settings.show_difficulty) {
			html += `<td>${state.difficulty.toFixed(2)}</td>`;
		}

		html += `<td>${dueDateStr}</td>`;
		html += `</tr>`;
	}

	html += `</tbody>`;
	html += `</table>`;

	// Если карточек больше, чем можно показать
	if (cards.length > maxCardsToShow) {
		const hiddenCount = cards.length - maxCardsToShow;
		html += `<div class="fsrs-now-info"><small>Показано: ${maxCardsToShow} из ${cards.length} карточек (${hiddenCount} скрыто)</small></div>`;
	}

	// Футер с инструкцией
	html += `<div class="fsrs-now-footer"><small>Для обновления списка выполните команду "Найти карточки для повторения"</small></div>`;
	html += `</div>`;

	return html;
}

/**
 * Генерирует HTML для пустого списка карточек
 */
export function generateEmptyStateHTML(): string {
	return `<div class="fsrs-now-container">
		<h4>Карточки для повторения</h4>
		<div class="fsrs-now-empty">
			<p>Нет карточек для повторения.</p>
			<small>Используйте команду "Добавить FSRS поля" для создания новых карточек.</small>
		</div>
	</div>`;
}
