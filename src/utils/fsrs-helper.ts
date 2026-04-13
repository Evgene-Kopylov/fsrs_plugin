// Утилиты для работы с WASM и FSRS в Obsidian плагине

import type { FSRSCard, FSRSState, FSRSRating } from "../interfaces/fsrs";

/**
 * Конвертирует base64 строку в Uint8Array для загрузки WASM модуля
 */
export function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/**
 * Парсит frontmatter файла и извлекает поля FSRS
 */
export function parseFSRSFromFrontmatter(
    frontmatter: string,
    filePath: string
): FSRSCard | null {
    try {
        // Проверяем наличие полей FSRS
        const hasFsrsDue = /^fsrs_due:/m.test(frontmatter);
        const hasFsrsState = /^fsrs_state:/m.test(frontmatter);

        if (!hasFsrsDue || !hasFsrsState) {
            return null;
        }

        // Парсим поля FSRS
        const dueMatch = /^fsrs_due:\s*"([^"]+)"/m.exec(frontmatter);
        const stabilityMatch = /^fsrs_stability:\s*([0-9.]+)/m.exec(frontmatter);
        const difficultyMatch = /^fsrs_difficulty:\s*([0-9.]+)/m.exec(frontmatter);
        const elapsedDaysMatch = /^fsrs_elapsed_days:\s*([0-9]+)/m.exec(frontmatter);
        const scheduledDaysMatch = /^fsrs_scheduled_days:\s*([0-9]+)/m.exec(frontmatter);
        const repsMatch = /^fsrs_reps:\s*([0-9]+)/m.exec(frontmatter);
        const lapsesMatch = /^fsrs_lapses:\s*([0-9]+)/m.exec(frontmatter);
        const stateMatch = /^fsrs_state:\s*"([^"]+)"/m.exec(frontmatter);
        const lastReviewMatch = /^fsrs_last_review:\s*"([^"]+)"/m.exec(frontmatter);

        if (!dueMatch || !dueMatch[1]) {
            return null;
        }

        const dueDate = new Date(dueMatch[1]!);
        const now = new Date();

        // Проверяем, что дата валидна
        if (isNaN(dueDate.getTime())) {
            return null;
        }

        return {
            due: dueMatch[1]!,
            stability: stabilityMatch && stabilityMatch[1] ? parseFloat(stabilityMatch[1]!) : 0,
            difficulty: difficultyMatch && difficultyMatch[1] ? parseFloat(difficultyMatch[1]!) : 0,
            elapsed_days: elapsedDaysMatch && elapsedDaysMatch[1] ? parseInt(elapsedDaysMatch[1]!) : 0,
            scheduled_days: scheduledDaysMatch && scheduledDaysMatch[1] ? parseInt(scheduledDaysMatch[1]!) : 0,
            reps: repsMatch && repsMatch[1] ? parseInt(repsMatch[1]!) : 0,
            lapses: lapsesMatch && lapsesMatch[1] ? parseInt(lapsesMatch[1]!) : 0,
            state: (stateMatch && stateMatch[1] ? stateMatch[1]! : "New") as FSRSState,
            last_review: lastReviewMatch && lastReviewMatch[1] ? lastReviewMatch[1]! : new Date().toISOString(),
            filePath,
        };
    } catch (error) {
        console.error(`Ошибка при парсинге FSRS полей из файла ${filePath}:`, error);
        return null;
    }
}

/**
 * Проверяет, готова ли карточка к повторению
 */
export function isCardDue(card: FSRSCard, now: Date = new Date()): boolean {
    try {
        const dueDate = new Date(card.due);
        return dueDate <= now;
    } catch (error) {
        console.error(`Ошибка при проверке даты повторения карточки ${card.filePath}:`, error);
        return false;
    }
}

/**
 * Рассчитывает время просрочки карточки в часах
 */
export function getOverdueHours(card: FSRSCard, now: Date = new Date()): number {
    try {
        const dueDate = new Date(card.due);
        const diffMs = now.getTime() - dueDate.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60));
    } catch (error) {
        console.error(`Ошибка при расчете просрочки карточки ${card.filePath}:`, error);
        return 0;
    }
}

/**
 * Форматирует время просрочки в читаемый вид
 */
export function formatOverdueTime(hours: number): string {
    if (hours <= 0) return "по графику";

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    const parts: string[] = [];
    if (days > 0) {
        parts.push(`${days} ${getRussianNoun(days, "день", "дня", "дней")}`);
    }
    if (remainingHours > 0) {
        parts.push(`${remainingHours} ${getRussianNoun(remainingHours, "час", "часа", "часов")}`);
    }

    return parts.join(" ");
}

/**
 * Вспомогательная функция для склонения русских существительных
 */
export function getRussianNoun(number: number, one: string, two: string, five: string): string {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;

    if (n > 10 && n < 20) return five;
    if (n1 > 1 && n1 < 5) return two;
    if (n1 === 1) return one;
    return five;
}

/**
 * Сортирует карточки по приоритету повторения
 */
export function sortCardsByPriority(cards: FSRSCard[], now: Date = new Date()): FSRSCard[] {
    return [...cards].sort((a, b) => {
        // Сначала по дате повторения (самые старые первыми)
        const aDue = new Date(a.due).getTime();
        const bDue = new Date(b.due).getTime();
        return aDue - bDue;
    });
}

/**
 * Фильтрует карточки для повторения
 */
export function filterCardsForReview(cards: FSRSCard[], now: Date = new Date()): FSRSCard[] {
    return cards.filter(card => isCardDue(card, now));
}

/**
 * Ограничивает количество карточек для отображения
 */
export function limitCards(cards: FSRSCard[], max: number = 30): FSRSCard[] {
    return cards.slice(0, max);
}

/**
 * Генерирует HTML для отображения карточки в блоке fsrs-now
 */
export function generateCardHTML(card: FSRSCard, index: number, now: Date = new Date()): string {
    const overdueHours = getOverdueHours(card, now);
    const overdueText = formatOverdueTime(overdueHours);

    return `
        <div class="fsrs-now-card" data-state="${card.state}">
            <div class="fsrs-now-card-header">
                <strong>${index + 1}. <a href="#" data-file-path="${card.filePath}" class="internal-link fsrs-now-link">${card.filePath}</a></strong>
            </div>
            <div class="fsrs-now-card-content">
                <small>
                    <span class="fsrs-now-field"><strong>Просрочено:</strong> ${overdueText}</span><br>
                    <span class="fsrs-now-field"><strong>Состояние:</strong> ${card.state} | <strong>Повторений:</strong> ${card.reps} | <strong>Ошибок:</strong> ${card.lapses}</span><br>
                    <span class="fsrs-now-field"><strong>Стабильность:</strong> ${card.stability.toFixed(2)} | <strong>Сложность:</strong> ${card.difficulty.toFixed(2)}</span><br>
                    <span class="fsrs-now-field"><strong>Дата повторения:</strong> ${new Date(card.due).toLocaleString()}</span><br>
                </small>
            </div>
        </div><br>`;
}

/**
 * Генерирует полный HTML для блока fsrs-now
 */
export function generateFsrsNowHTML(cards: FSRSCard[], now: Date = new Date()): string {
    const maxCardsToShow = 30;
    const cardsToShow = limitCards(cards, maxCardsToShow);

    let html = `<div class="fsrs-now-container">`;
    html += `<h4>Карточки для повторения (${cards.length})</h4>`;
    html += `<small>Обновлено: ${now.toLocaleString()}</small><br><br>`;

    cardsToShow.forEach((card, index) => {
        html += generateCardHTML(card, index, now);
    });

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
 * Валидирует JSON карточки FSRS
 */
export function validateFSRSCardJSON(json: string): boolean {
    try {
        const card = JSON.parse(json);
        return (
            typeof card.due === "string" &&
            typeof card.stability === "number" &&
            typeof card.difficulty === "number" &&
            typeof card.elapsed_days === "number" &&
            typeof card.scheduled_days === "number" &&
            typeof card.reps === "number" &&
            typeof card.lapses === "number" &&
            typeof card.state === "string" &&
            typeof card.last_review === "string"
        );
    } catch {
        return false;
    }
}

/**
 * Создает новую карточку FSRS с дефолтными значениями
 */
export function createDefaultFSRSCard(filePath: string): FSRSCard {
    const now = new Date();
    return {
        due: now.toISOString(),
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: "New",
        last_review: now.toISOString(),
        filePath,
    };
}
