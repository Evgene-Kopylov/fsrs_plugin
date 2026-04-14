// Файл для обратной совместимости - реэкспортирует функции из новой модульной структуры
// Этот файл сохранен для поддержки существующих импортов

/**
 * @deprecated Используйте модуль `./review` для новых импортов
 * Файл сохранен для обратной совместимости
 */

// Реэкспорт всех компонентов из нового модуля review
export { ReviewModal } from "./review/review-modal";
export {
	reviewCurrentCard,
	reviewCurrentCardSimple,
} from "./review/review-card";
