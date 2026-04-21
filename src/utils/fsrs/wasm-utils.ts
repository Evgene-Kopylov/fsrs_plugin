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

/** Преобразует карточку FSRS в YAML строку через WASM */
export function cardToFsrsYaml(card: ModernFSRSCard): string {
    try {
        const cardJson = JSON.stringify({ reviews: card.reviews });
        return wasm.card_to_fsrs_yaml(cardJson);
    } catch (error) {
        console.error("Ошибка при преобразовании карточки в YAML:", error);
        return "reviews: []";
    }
}
