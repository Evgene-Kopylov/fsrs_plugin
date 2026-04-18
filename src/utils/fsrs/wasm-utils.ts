// Вспомогательные функции для WASM модуля FSRS

import type { ModernFSRSCard } from "../../interfaces/fsrs";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/** Получает текущее время в ISO формате через WASM */
export function getCurrentISOTime(): string {
	try {
		return wasm.get_current_time();
	} catch {
		return new Date().toISOString();
	}
}

/** Конвертирует base64 строку в Uint8Array для загрузки WASM модуля */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

interface ValidatedCard {
	reviews?: unknown[];
}

interface ValidatedReviewSession {
	date?: unknown;
	rating?: unknown;
	stability?: unknown;
	difficulty?: unknown;
}

/** Валидирует JSON карточки FSRS */
export function validateFSRSCardJSON(json: string): boolean {
	try {
		const card = JSON.parse(json) as ValidatedCard;
		return (
			Array.isArray(card.reviews) &&
			card.reviews.every(
				(session: ValidatedReviewSession) =>
					typeof session.date === "string" &&
					typeof session.rating === "string" &&
					typeof session.stability === "number" &&
					typeof session.difficulty === "number",
			)
		);
	} catch {
		return false;
	}
}

/** Создаёт карточку FSRS по умолчанию */
export function createDefaultFSRSCard(filePath: string): ModernFSRSCard {
	return { reviews: [], filePath };
}
