// Файл-индекс для реэкспорта всех модулей FSRS

// Экспорт парсеров
export { parseModernFsrsFromFrontmatter } from "./fsrs-parser";

// Экспорт функций работы с WASM
export {
    parametersToJson,
    computeCardState,
    isCardDue,
    getCardRetrievability,
    addReviewSession,
    getNewCardYaml,
    getCardYamlAfterReview,
    getNextReviewDates,
    base64ToBytes,
    cardToFsrsYaml,
} from "./fsrs-wasm";

// Экспорт функций работы со временем
export {
    getOverdueHours,
    formatOverdueTime,
    getRussianNoun,
    formatLocalDate,
    isCardOverdue,
    getHoursUntilDue,
    formatTimeUntilDue,
    describeCardState,
    getMinutesSinceLastReview,
} from "./fsrs-time";

// Экспорт функций фильтрации файлов
export {
    DEFAULT_IGNORE_PATTERNS,
    shouldIgnoreFile,
    shouldIgnoreFileWithSettings,
    formatIgnorePatterns,
    parseIgnorePatterns,
} from "./fsrs-filter";
// Экспорт функций работы с frontmatter
export {
    extractFrontmatter,
    extractFrontmatterWithMatch,
    createFrontmatter,
    updateFrontmatterInContent,
    removeFrontmatterFromContent,
} from "./fsrs-frontmatter";

// Экспорт нового FsrsCache (обёртка над WASM-кэшем)
export { FsrsCache } from "./fsrs-cache";

// Реэкспорт типов для удобства
export type {
    ModernFSRSCard,
    ReviewSession,
    FSRSRating,
    FSRSState,
    ComputedCardState,
    FSRSSettings,
    FSRSParameters,
    ParseResult,
} from "../../interfaces/fsrs";
