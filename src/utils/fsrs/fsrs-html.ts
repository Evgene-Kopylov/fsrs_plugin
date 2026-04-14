// Генерация HTML для отображения карточек FSRS

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
	// Убираем расширение .md если есть
	if (fileName.endsWith(".md")) {
		return fileName.slice(0, -3);
	}
	return fileName;
}

/**
 * Генерирует HTML для одной карточки FSRS
 */
export function generateCardHTML(
	card: ModernFSRSCard,
	computedState: ComputedCardState,
	index: number,
	settings: FSRSSettings,
	now: Date = new Date(),
): string {
	const overdueHours = getOverdueHours(new Date(computedState.due), now);
	const overdueText = formatOverdueTime(overdueHours);

	const dueDate = new Date(computedState.due);
	const dueDateStr = dueDate.toLocaleString();

	const displayName = extractDisplayName(card.filePath);

	let html = `<div class="fsrs-now-card" data-state="${computedState.state}">`;
	html += `<div class="fsrs-now-card-header">`;
	// Используем href с прямым путём к файлу (без [[...]]), чтобы Hover Preview работал
	html += `<strong>${index + 1}. <a href="${card.filePath}" data-file-path="${card.filePath}" class="internal-link">${displayName}</a></strong>`;
	html += `</div>`;
	html += `<div class="fsrs-now-card-content">`;
	html += `<small>`;

	html += `<span class="fsrs-now-field"><strong>Просрочено:</strong> ${overdueText}</span><br>`;
	html += `<span class="fsrs-now-field"><strong>Состояние:</strong> ${computedState.state}`;
	html += ` | <strong>Повторений:</strong> ${card.reviews.length}`;
	html += `</span><br>`;

	if (settings.show_stability) {
		html += `<span class="fsrs-now-field"><strong>Стабильность:</strong> ${computedState.stability.toFixed(2)}</span><br>`;
	}
	if (settings.show_difficulty) {
		html += `<span class="fsrs-now-field"><strong>Сложность:</strong> ${computedState.difficulty.toFixed(2)}</span><br>`;
	}
	if (settings.show_retrievability) {
		html += `<span class="fsrs-now-field"><strong>Извлекаемость:</strong> ${(computedState.retrievability * 100).toFixed(1)}%</span><br>`;
	}
	if (settings.show_advanced_stats) {
		html += `<span class="fsrs-now-field"><strong>Прошло дней:</strong> ${computedState.elapsed_days}`;
		html += ` | <strong>Запланировано:</strong> ${computedState.scheduled_days}</span><br>`;
		html += `<span class="fsrs-now-field"><strong>Всего повторений:</strong> ${computedState.reps}`;
		html += ` | <strong>Ошибок:</strong> ${computedState.lapses}</span><br>`;
	}
	html += `<span class="fsrs-now-field"><strong>Дата повторения:</strong> ${dueDateStr}</span><br>`;

	html += `</small>`;
	html += `</div>`;
	html += `</div><br>`;

	return html;
}

/**
 * Генерирует полный HTML для блока fsrs-now
 */
export async function generateFsrsNowHTML(
	cards: ModernFSRSCard[],
	settings: FSRSSettings,
	now: Date = new Date(),
): Promise<string> {
	const maxCardsToShow = settings.max_cards_to_show || 30;
	const cardsToShow = cards.slice(0, maxCardsToShow);

	let html = `<div class="fsrs-now-container">`;
	html += `<h4>Карточки для повторения (${cards.length})</h4>`;
	html += `<small>Обновлено: ${now.toLocaleString()}</small><br><br>`;

	for (let i = 0; i < cardsToShow.length; i++) {
		const card = cardsToShow[i];
		if (!card) continue;
		try {
			const computedState = await computeCardState(card, settings, now);
			html += generateCardHTML(card, computedState, i, settings, now);
		} catch (error) {
			console.error(
				`Ошибка при генерации HTML для карточки ${card.filePath}:`,
				error,
			);
			html += `<div class="fsrs-now-card fsrs-now-error">`;
			html += `<strong>${i + 1}. ${card.filePath}</strong><br>`;
			html += `<small>Ошибка при загрузке карточки</small>`;
			html += `</div><br>`;
		}
	}

	if (cards.length > maxCardsToShow) {
		const hiddenCount = cards.length - maxCardsToShow;
		html += `<div class="fsrs-now-info">`;
		html += `<small>Показано: ${maxCardsToShow} из ${cards.length} карточек (${hiddenCount} скрыто)</small>`;
		html += `</div>`;
	}

	html += `<div class="fsrs-now-footer">`;
	html += `<small>Для обновления списка выполните команду "Найти карточки для повторения"</small>`;
	html += `</div>`;
	html += `</div>`;

	return html;
}

/**
 * Генерирует HTML для пустого списка карточек
 */
export function generateEmptyStateHTML(): string {
	let html = `<div class="fsrs-now-container">`;
	html += `<h4>Карточки для повторения</h4>`;
	html += `<div class="fsrs-now-empty">`;
	html += `<p>Нет карточки для повторения.</p>`;
	html += `<small>Используйте команду "Добавить FSRS поля" для создания новых карточек.</small>`;
	html += `</div>`;
	html += `</div>`;
	return html;
}
