// Базовые утилиты для работы с WASM модулем FSRS

import type {
	ModernFSRSCard,
	FSRSSettings,
	FSRSParameters,
} from "../../interfaces/fsrs";

/** Преобразует карточку в JSON-строку для WASM */
export const serializeCard = (card: ModernFSRSCard): string =>
	JSON.stringify({ reviews: card.reviews });

/** Преобразует параметры FSRS в JSON-строку для WASM */
export const parametersToJson = (p: FSRSParameters): string =>
	JSON.stringify({
		request_retention: p.request_retention,
		maximum_interval: p.maximum_interval,
		enable_fuzz: p.enable_fuzz,
	});

/** Подготовка общих аргументов для большинства функций */
export const prepareCommonArgs = (
	card: ModernFSRSCard,
	settings: FSRSSettings,
	now: Date,
) => ({
	cardJson: serializeCard(card),
	nowStr: now.toISOString(),
	parametersJson: parametersToJson(settings.parameters),
	defaultStability: settings.default_initial_stability,
	defaultDifficulty: settings.default_initial_difficulty,
});
