import { App, TFile, TAbstractFile } from "obsidian";
import type {
    CachedCard,
    FSRSSettings,
    ModernFSRSCard,
} from "../../interfaces/fsrs";
import { shouldIgnoreFileWithSettings } from "./fsrs-filter";
import { shouldProcessFile, extractFrontmatter } from "./fsrs-frontmatter";
import { parseModernFsrsFromFrontmatter } from "./fsrs-parser";
import { computeCardState } from "./fsrs-wasm";

/**
 * Менеджер инкрементального кэша карточек FSRS
 * Заменяет полное сканирование хранилища при каждом изменении на точечное обновление
 */
export class IncrementalCache {
    private cardCache = new Map<string, CachedCard>();
    private cacheInitialized = false;
    private scanPromise: Promise<void> | null = null;
    private pendingUpdates = new Map<string, NodeJS.Timeout>();

    constructor(
        private app: App,
        private settings: FSRSSettings,
        private onCacheUpdated: () => void,
    ) {}

    /**
     * Инициализирует кэш (выполняет полное сканирование если ещё не инициализирован)
     */
    async initializeCache(): Promise<void> {
        if (this.cacheInitialized) return;
        if (this.scanPromise) return this.scanPromise;
        this.scanPromise = this.performFullScan();
        try {
            await this.scanPromise;
            this.cacheInitialized = true;
        } finally {
            this.scanPromise = null;
        }
    }

    /**
     * Возвращает все карточки из кэша
     */
    async getCachedCardsWithState(): Promise<CachedCard[]> {
        await this.initializeCache();
        return Array.from(this.cardCache.values());
    }

    /**
     * Выполняет полное сканирование хранилища и заполняет кэш
     */
    private async performFullScan(): Promise<void> {
        const start = performance.now();
        const files = this.app.vault.getMarkdownFiles();
        this.cardCache.clear();

        for (const file of files) {
            if (shouldIgnoreFileWithSettings(file.path, this.settings))
                continue;
            try {
                const content = await this.app.vault.read(file);
                if (!shouldProcessFile(content)) continue;
                const frontmatter = extractFrontmatter(content);
                if (!frontmatter) continue;
                const parseResult = parseModernFsrsFromFrontmatter(
                    frontmatter,
                    file.path,
                );
                if (parseResult.success && parseResult.card) {
                    const state = await computeCardState(
                        parseResult.card,
                        this.settings,
                    );
                    this.cardCache.set(file.path, {
                        card: parseResult.card,
                        state,
                    });
                }
            } catch (error) {
                console.warn(`Ошибка при чтении файла ${file.path}:`, error);
            }
        }

        console.debug(`✅ Найдено карточек FSRS: ${this.cardCache.size}`);
        const elapsed = (performance.now() - start) / 1000;
        console.debug(
            `⏱️ Сканирование всего хранилища: ${elapsed.toFixed(2)} с`,
        );
    }

    /**
     * Обновляет карточку в кэше по указанному пути файла
     */
    async updateCard(filePath: string): Promise<void> {
        if (shouldIgnoreFileWithSettings(filePath, this.settings)) {
            // Удаляем из кэша если файл игнорируется
            if (this.cardCache.has(filePath)) {
                this.cardCache.delete(filePath);
                this.onCacheUpdated();
            }
            return;
        }

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;

            const content = await this.app.vault.read(file);
            if (!shouldProcessFile(content)) {
                // Не FSRS карточка - удаляем из кэша
                if (this.cardCache.has(filePath)) {
                    this.cardCache.delete(filePath);
                    this.onCacheUpdated();
                }
                return;
            }

            const frontmatter = extractFrontmatter(content);
            if (!frontmatter) {
                if (this.cardCache.has(filePath)) {
                    this.cardCache.delete(filePath);
                    this.onCacheUpdated();
                }
                return;
            }

            const parseResult = parseModernFsrsFromFrontmatter(
                frontmatter,
                filePath,
            );
            if (parseResult.success && parseResult.card) {
                const state = await computeCardState(
                    parseResult.card,
                    this.settings,
                );
                this.cardCache.set(filePath, { card: parseResult.card, state });
                this.onCacheUpdated();
            } else {
                // Ошибка парсинга или не FSRS - удаляем из кэша
                if (this.cardCache.has(filePath)) {
                    this.cardCache.delete(filePath);
                    this.onCacheUpdated();
                }
            }
        } catch (error) {
            console.warn(`Ошибка при обновлении карточки ${filePath}:`, error);
            // При ошибке удаляем из кэша
            if (this.cardCache.has(filePath)) {
                this.cardCache.delete(filePath);
                this.onCacheUpdated();
            }
        }
    }

    /**
     * Планирует обновление карточки с debounce 500 мс
     */
    scheduleCardUpdate(filePath: string): void {
        // Отменяем предыдущий таймер для этого файла
        const existingTimer = this.pendingUpdates.get(filePath);
        if (existingTimer) clearTimeout(existingTimer);

        // Создаем новый таймер
        const timer = setTimeout(() => {
            void this.updateCard(filePath);
            this.pendingUpdates.delete(filePath);
        }, 500);

        this.pendingUpdates.set(filePath, timer);
    }

    /**
     * Полностью инвалидирует кэш
     */
    invalidateCache(): void {
        this.cardCache.clear();
        this.cacheInitialized = false;
        this.scanPromise = null;
        // Очищаем все pending таймеры
        for (const timer of this.pendingUpdates.values()) clearTimeout(timer);
        this.pendingUpdates.clear();
        this.onCacheUpdated();
    }

    /**
     * Обрабатывает удаление файла
     */
    handleFileDelete(file: TAbstractFile): void {
        if (this.cardCache.has(file.path)) {
            this.cardCache.delete(file.path);
            this.onCacheUpdated();
        }
    }

    /**
     * Обрабатывает переименование файла
     */
    handleFileRename(file: TAbstractFile, oldPath: string): void {
        if (this.cardCache.has(oldPath)) {
            const entry = this.cardCache.get(oldPath)!;
            this.cardCache.delete(oldPath);
            const newCard: ModernFSRSCard = {
                ...entry.card,
                filePath: file.path,
            };
            this.cardCache.set(file.path, {
                card: newCard,
                state: entry.state,
            });
            this.onCacheUpdated();
        } else {
            this.scheduleCardUpdate(file.path);
        }
    }

    /**
     * Очищает все ресурсы (таймеры) перед выгрузкой
     */
    unload(): void {
        for (const timer of this.pendingUpdates.values()) clearTimeout(timer);
        this.pendingUpdates.clear();
    }
}
