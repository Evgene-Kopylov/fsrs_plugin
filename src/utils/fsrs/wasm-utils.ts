// Вспомогательные функции для WASM модуля FSRS

import type { CardData } from "../../interfaces/fsrs";
import * as wasm from "../../../wasm-lib/pkg/wasm_lib";

/** Преобразует карточку FSRS в YAML строку через WASM */
export function cardToFsrsYaml(card: CardData): string {
    try {
        const cardJson = JSON.stringify({ reviews: card.reviews });
        return wasm.card_to_fsrs_yaml(cardJson);
    } catch (error) {
        console.error("Ошибка при преобразовании карточки в YAML:", error);
        return "reviews: []";
    }
}
