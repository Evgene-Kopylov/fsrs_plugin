// Точка входа для WASM функций FSRS плагина
// Явные реэкспорты — только то, что используется внешними модулями

export { parametersToJson } from "./wasm-core";

export { computeCardState, isCardDue, getNextReviewDates } from "./wasm-state";

export {
    addReviewSession,
    getNewCardYaml,
    getCardYamlAfterReview,
} from "./wasm-review";

export { base64ToBytes, cardToFsrsYaml } from "./wasm-utils";
