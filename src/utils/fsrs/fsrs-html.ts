// Генерация HTML для табличного отображения карточек FSRS в блоке fsrs-now

import type {
	ModernFSRSCard,
	ComputedCardState,
	FSRSSettings,
} from "../../interfaces/fsrs";
import { computeCardState } from "./fsrs-wasm";

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

	// Получаем состояние для каждой карточки
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
	html += `<h4 class="fsrs-now-header"><span class="fsrs-header-text">Карточек для повторения сегодня: ${cards.length}</span><span class="fsrs-info-icon" title="Отобраны и отсортированы по алгоритму FSRS:&#10;сначала карточки с наименьшей извлекаемостью (retrievability).&#10;&#10;Данные обновлены: ${now.toLocaleString()}">(?)</span></h4>`;

	html += `<table class="fsrs-now-table">`;
	html += `<thead><tr>`;
	html += `<th class="fsrs-col-file">Файл</th>`;
	html += `<th class="fsrs-col-reps">Повторений</th>`;
	html += `<th class="fsrs-col-overdue">Просрочка</th>`;
	html += `</tr></thead><tbody>`;

	for (const { card, state } of cardsWithState) {
		const displayName = extractDisplayName(card.filePath);
		const dueDate = new Date(state.due);
		const diffMs = dueDate.getTime() - now.getTime();
		const diffHours = diffMs / (1000 * 3600);
		const absDiffHours = Math.abs(diffHours);
		let overdueText: string;
		if (absDiffHours < 24) {
			// Показываем в часах, округляем до целых
			const hours = Math.round(diffHours);
			if (hours < 0) {
				overdueText = `${hours} ч`;
			} else if (hours === 0) {
				overdueText = `0 ч`;
			} else {
				overdueText = `+${hours} ч`;
			}
		} else {
			// Показываем в днях
			const days = Math.round(diffHours / 24);
			if (days < 0) {
				overdueText = `${days} дн`;
			} else if (days === 0) {
				overdueText = `0 дн`;
			} else {
				overdueText = `+${days} дн`;
			}
		}

		html += `<tr class="fsrs-now-row" data-file-path="${card.filePath}">`;
		html += `<td class="fsrs-col-file"><a href="${card.filePath}" data-file-path="${card.filePath}" class="internal-link">${displayName}</a></td>`;
		html += `<td class="fsrs-col-reps">${card.reviews.length}</td>`;
		html += `<td class="fsrs-col-overdue">${overdueText}</td>`;
		html += `</tr>`;
	}

	html += `</tbody></table>`;

	if (cards.length > maxCardsToShow) {
		const hiddenCount = cards.length - maxCardsToShow;
		html += `<div class="fsrs-now-info"><small>Показано: ${maxCardsToShow} из ${cards.length} карточек (${hiddenCount} скрыто)</small></div>`;
	}

	html += `</div>`;
	return html;
}

/**
 * Генерирует HTML для пустого списка карточек
 */
export function generateEmptyStateHTML(): string {
	return `<div class="fsrs-now-container">
		<h4>Карточек для повторения сегодня</h4>
		<div class="fsrs-now-empty">
			<p>Нет карточки для повторения.</p>
			<small>Используйте команду "Добавить FSRS поля" для создания новых карточек.</small>
		</div>
	</div>`;
}
