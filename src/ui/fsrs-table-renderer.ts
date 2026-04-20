import { MarkdownRenderChild, Notice, EventRef, Editor } from "obsidian";
import type FsrsPlugin from "../main";
import type { CachedCard } from "../interfaces/fsrs";
import type { TableParams } from "../utils/fsrs-table-helpers";
import {
	generateTableHTMLFromCards,
	generateTableHTMLFromSql,
} from "../utils/fsrs-table-helpers";

/**
 * Класс для динамического рендеринга блока fsrs-table
 * Отображает все карточки
 */
export class FsrsTableRenderer extends MarkdownRenderChild {
	private params: TableParams | null = null;
	private isFirstLoad = true;
	private activeLeafHandler?: EventRef;
	private activeLeafCallback?: () => void;
	private lastVisibilityUpdate = 0;
	private lastAction: "sort" | "refresh" | null = null;
	private cachedCards: CachedCard[] | null = null;
	private sourceText: string;
	private sourceStart: number;
	private sourceEnd: number;

	constructor(
		private plugin: FsrsPlugin,
		private container: HTMLElement,
		private sourcePath: string,
		source: string,
		sourceStart: number,
		sourceEnd: number,
	) {
		super(container);
		this.params = null;
		this.sourceText = source;
		this.sourceStart = sourceStart;
		this.sourceEnd = sourceEnd;
	}

	/**
	 * Вызывается при загрузке компонента
	 */
	onload(): void {
		super.onload();
		// Регистрируем рендерер в плагине для уведомлений об обновлениях
		this.plugin.registerFsrsTableRenderer(this);

		// Регистрируем обработчик для обновления таблицы при возвращении видимости
		this.activeLeafCallback = () => {
			this.updateIfVisible().catch((error) => {
				console.error(
					"Ошибка при обновлении таблицы при возвращении видимости:",
					error,
				);
			});
		};
		this.activeLeafHandler = this.plugin.app.workspace.on(
			"active-leaf-change",
			this.activeLeafCallback,
		);

		void (async () => {
			await this.renderContent();
			this.isFirstLoad = false;
		})();
	}

	/**
	 * Вызывается при выгрузке компонента
	 */
	onunload() {
		// Удаляем обработчик активного листа
		if (this.activeLeafCallback) {
			this.plugin.app.workspace.off(
				"active-leaf-change",
				this.activeLeafCallback,
			);
			this.activeLeafCallback = undefined;
			this.activeLeafHandler = undefined;
		}

		// Удаляем рендерер из списка активных
		this.plugin.unregisterFsrsTableRenderer(this);
		super.onunload();
	}

	/**
	 * Основной метод рендеринга контента с поддержкой плавной анимации
	 */
	private async renderContent() {
		const start = performance.now();
		try {
			// Убираем класс ошибки при успешном рендере
			this.container.removeClass("fsrs-table-error");
			// Также убираем класс ошибки у родительского элемента блока кода
			const codeBlockParent = this.container.closest(
				".block-language-fsrs-table, .cm-preview-code-block.block-language-fsrs-table, .cm-embed-block.block-language-fsrs-table",
			);
			if (codeBlockParent) {
				codeBlockParent.removeClass("fsrs-table-error");
			}
			// При первом показе используем индикатор загрузки
			if (this.isFirstLoad) {
				this.showLoadingIndicator();
			} else {
				// При последующих обновлениях применяем плавную анимацию opacity
				this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
				this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			}

			// Получаем все карточки через плагин, при сортировке используем кеш
			const allCards =
				this.lastAction === "sort" && this.cachedCards
					? this.cachedCards
					: await this.plugin.getCachedCardsWithState();
			// Сохраняем карточки в кеш для будущих сортировок
			this.cachedCards = allCards;
			const now = new Date();

			// Отладочный вывод для отслеживания параметров
			console.debug("FsrsTableRenderer.renderContent:", {
				cardCount: allCards.length,
				hasParams: !!this.params,
				params: this.params
					? (JSON.parse(JSON.stringify(this.params)) as unknown)
					: null,
				sourceText: this.sourceText,
				lastAction: this.lastAction,
				hasSort: this.params?.sort ? true : false,
			});

			if (allCards.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Проверяем на пустой SQL запрос (только при первом рендере)
			if (
				!this.params &&
				(!this.sourceText || this.sourceText.trim() === "")
			) {
				this.renderErrorState(new Error("Пустой блок fsrs-table"));
				return;
			}

			let html: string;
			// Генерируем HTML таблицы
			if (this.params) {
				// Если параметры уже есть (при сортировке), используем их
				console.debug(
					"Using existing params for table generation:",
					this.params,
				);
				html = await generateTableHTMLFromCards(
					allCards,
					this.params,
					this.plugin.settings,
					this.plugin.app,
					now,
				);
			} else {
				// При первом рендере используем SQL напрямую
				console.debug(
					"Parsing SQL source for table generation:",
					this.sourceText,
				);
				const result = await generateTableHTMLFromSql(
					allCards.map((c) => c.card),
					this.sourceText,
					this.plugin.settings,
					this.plugin.app,
					now,
				);
				html = result.html;
				this.params = result.params;
				console.debug("Parsed params from SQL:", this.params);
			}

			// Очищаем контейнер и вставляем новый HTML
			this.container.empty();
			// eslint-disable-next-line @microsoft/sdl/no-inner-html
			this.container.insertAdjacentHTML("afterbegin", html);

			// Добавляем обработчики событий для кликабельных ссылок
			this.addEventListeners();

			// Восстанавливаем полную прозрачность после обновления
			if (!this.isFirstLoad) {
				this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			}

			// Обновляем время последнего обновления
			this.lastVisibilityUpdate = Date.now();
		} catch (error) {
			this.renderErrorState(error);
		} finally {
			const elapsedMs = performance.now() - start;
			const elapsedSec = elapsedMs / 1000;
			console.debug(
				`⏱️ Загрузка таблицы FSRS: ${elapsedSec.toFixed(2)} с`,
			);
		}
	}

	/**
	 * Показывает индикатор загрузки (только при первом отображении)
	 */
	private showLoadingIndicator() {
		this.container.empty();
		const loadingDiv = this.container.createDiv({
			cls: "fsrs-table-loading",
		});
		loadingDiv.createEl("small", {
			text: "Loading fsrs cards...",
		});
	}

	/**
	 * Отображает состояние "нет карточек"
	 */
	private renderEmptyState() {
		// При пустом состоянии также применяем анимацию, если это не первый показ
		if (!this.isFirstLoad) {
			this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
		this.container.empty();

		// Просто очищаем контейнер без вставки сообщения
		if (!this.isFirstLoad) {
			this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
	}

	/**
	 * Отображает состояние ошибки в виде простого текста без стилей
	 */
	private renderErrorState(error: unknown) {
		console.error(`Ошибка при рендеринге блока fsrs-table:`, error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		// Добавляем класс ошибки и очищаем контейнер
		this.container.addClass("fsrs-table-error");
		// Также добавляем класс ошибки родительскому элементу блока кода
		const codeBlockParent = this.container.closest(
			".block-language-fsrs-table, .cm-preview-code-block.block-language-fsrs-table, .cm-embed-block.block-language-fsrs-table",
		);
		if (codeBlockParent) {
			codeBlockParent.addClass("fsrs-table-error");
		}
		this.container.empty();
		this.container.createEl("pre", {
			text: errorMessage,
			cls: "fsrs-table-error-text",
		});
	}

	/**
	 * Добавляет обработчики событий для кликабельных элементов
	 */
	private addEventListeners() {
		// Обработчики для ссылок на файлы
		this.container.querySelectorAll(".internal-link").forEach((link) => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const filePath = (link as HTMLElement).dataset.filePath;
				if (filePath) {
					void this.openFile(filePath);
				}
			});
		});

		// Обработчик для заголовков сортировки в таблице
		this.container
			.querySelectorAll(".fsrs-sort-header")
			.forEach((button) => {
				button.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					const field = (button as HTMLElement).dataset.field;
					if (field) {
						void this.handleSortClick(field);
					}
				});
			});
	}

	/**
	 * Открывает файл в Obsidian
	 */
	private async openFile(filePath: string) {
		try {
			const file = this.plugin.app.vault.getFileByPath(filePath);
			if (file) {
				await this.plugin.app.workspace.openLinkText(
					filePath,
					"",
					true,
				);
			} else {
				void new Notice(`File not found: ${filePath}`);
			}
		} catch (error) {
			console.error("Ошибка при открытии файла:", error);
			void new Notice(`Could not open file: ${filePath}`);
		}
	}

	/**
	 * Обновляет содержимое блока с поддержкой анимации
	 * Может быть вызвано извне для принудительного обновления
	 */
	async refresh() {
		if (this.lastAction !== "sort") {
			this.lastAction = "refresh";
		}
		await this.renderContent();
		this.lastAction = null;
	}

	/**
	 * Обновляет таблицу, если файл активен и прошло достаточно времени
	 */
	private async updateIfVisible(): Promise<void> {
		const activeFile = this.plugin.app.workspace.getActiveFile();
		if (!activeFile || activeFile.path !== this.sourcePath) {
			return;
		}

		// Дебаунс: обновляем не чаще чем..
		const now = Date.now();
		if (now - this.lastVisibilityUpdate > 2000) {
			this.lastVisibilityUpdate = now;
			await this.refresh();
		}
	}

	/**
	 * Обрабатывает клик на заголовок для сортировки
	 * @param field Поле, по которому нужно сортировать
	 */
	private async handleSortClick(field: string) {
		if (!this.params) return;
		// Определяем следующее состояние сортировки
		const nextDirection = this.getNextSortDirection(field);

		// Обновляем параметры
		if (nextDirection === null) {
			// Удаляем параметр сортировки
			delete this.params.sort;
		} else {
			// Устанавливаем или обновляем параметр сортировки
			this.params.sort = { field, direction: nextDirection };
		}

		this.lastAction = "sort";

		console.debug("handleSortClick:", {
			field,
			nextDirection,
			params: this.params
				? (JSON.parse(JSON.stringify(this.params)) as unknown)
				: null,
		});

		// Перерисовываем таблицу с новыми параметрами сортировки
		await this.refresh();
	}

	/**
	 * Возвращает следующее направление сортировки для поля
	 * Логика: нет параметра → ASC → DESC → нет параметра
	 * @param field Поле для сортировки
	 * @returns Следующее направление сортировки или null для снятия сортировки
	 */
	private getNextSortDirection(field: string): "ASC" | "DESC" | null {
		if (!this.params) return null;
		const currentSort = this.params.sort;

		// Если сортируем по другому полю, начинаем с ASC
		if (!currentSort || currentSort.field !== field) {
			return "ASC";
		}

		// Переключаем направление: ASC → DESC → снять сортировку
		if (currentSort.direction === "ASC") {
			return "DESC";
		} else {
			// DESC → снять сортировку
			return null;
		}
	}

	/**
	 * Обновляет исходный код блока с новыми параметрами сортировки
	 */
	private async updateSourceCode(): Promise<void> {
		if (!this.params) return;
		try {
			// Получаем активный редактор
			const editor = this.plugin.app.workspace.activeEditor?.editor;
			if (!editor) {
				console.warn(
					"Не найден активный редактор для обновления кода блока",
				);
				return;
			}

			// Получаем текущее содержимое блока
			const currentContent = this.getBlockContentFromEditor(editor);
			if (!currentContent) {
				console.warn("Не удалось получить содержимое блока");
				return;
			}

			// Извлекаем внутреннее содержимое блока (без обратных кавычек)
			const innerContent = this.extractInnerBlockContent(currentContent);
			if (!innerContent) {
				console.warn("Не удалось извлечь содержимое блока fsrs-table");
				return;
			}

			// Генерируем обновленное внутреннее содержимое
			const updatedInnerContent =
				this.generateUpdatedBlockContent(innerContent);

			// Создаем полный обновленный блок
			const updatedContent = this.wrapBlockContent(updatedInnerContent);

			// Если содержимое изменилось
			if (updatedContent !== currentContent) {
				// Вычисляем позиции для replaceRange
				const startPos = { line: this.sourceStart, ch: 0 };
				const endPos = {
					line: this.sourceEnd,
					ch: editor.getLine(this.sourceEnd)?.length || 0,
				};

				// Заменяем содержимое блока
				editor.replaceRange(updatedContent, startPos, endPos);

				// Вычисляем новые позиции блока
				const newLineCount = updatedContent.split("\n").length - 1;
				this.sourceEnd = this.sourceStart + newLineCount;
				this.sourceText = updatedContent;
				// Обновляем параметры из внутреннего содержимого
				try {
					// При обновлении кода блока используем новую функцию generateTableHTMLFromSql
					// чтобы получить параметры из SQL
					const { params } = await generateTableHTMLFromSql(
						(this.cachedCards || []).map((c) => c.card),
						updatedInnerContent,
						this.plugin.settings,
						this.plugin.app,
						new Date(),
					);
					this.params = params;
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
				} catch (_error) {
					// Игнорируем ошибку парсинга, так как теперь будем использовать SQL напрямую
					this.params = null;
				}
			}
		} catch (error) {
			console.error("Ошибка при обновлении исходного кода блока:", error);
		}
	}

	/**
	 * Получает содержимое блока из редактора по сохраненным позициям
	 */
	private getBlockContentFromEditor(editor: Editor): string | null {
		try {
			const lines: string[] = [];
			for (let i = this.sourceStart; i <= this.sourceEnd; i++) {
				const line = editor.getLine(i);
				if (line !== null) {
					lines.push(line);
				}
			}
			return lines.join("\n");
		} catch {
			return null;
		}
	}

	/**
	 * Извлекает внутреннее содержимое блока fsrs-table (без обратных кавычек)
	 * @param blockContent Полное содержимое блока с обратными кавычками
	 * @returns Внутреннее содержимое или null если формат некорректен
	 */
	private extractInnerBlockContent(blockContent: string): string | null {
		const lines = blockContent.split("\n");
		const innerLines: string[] = [];
		let inBlock = false;

		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("```fsrs-table")) {
				inBlock = true;
				continue;
			}
			if (trimmed === "```") {
				break;
			}
			if (inBlock) {
				innerLines.push(line);
			}
		}

		return innerLines.length > 0 ? innerLines.join("\n") : null;
	}

	/**
	 * Обертывает внутреннее содержимое в блок кода fsrs-table
	 * @param innerContent Внутреннее содержимое блока
	 * @returns Полное содержимое блока с обратными кавычками
	 */
	private wrapBlockContent(innerContent: string): string {
		return `\`\`\`fsrs-table\n${innerContent}\n\`\`\``;
	}

	/**
	 * Генерирует обновленное содержимое блока с учетом параметров сортировки
	 * @param currentContent Текущее содержимое блока (без обратных кавычек)
	 * @returns Обновленное содержимое блока (без обратных кавычек)
	 */
	private generateUpdatedBlockContent(currentContent: string): string {
		if (!this.params) return currentContent;
		const lines = currentContent.split("\n");
		const updatedLines: string[] = [];

		// Флаг, указывающий, был ли найден и обработан параметр sort
		let sortProcessed = false;

		for (const line of lines) {
			const trimmed = line.trim();
			// Пропускаем пустые строки
			if (trimmed === "") {
				updatedLines.push(line);
				continue;
			}

			// Проверяем, является ли строка параметром ORDER BY
			if (trimmed.startsWith("ORDER BY")) {
				sortProcessed = true;
				// Если есть параметр sort, добавляем или заменяем его
				if (this.params.sort) {
					const indent = line.match(/^(\s*)/)?.[1] || "";
					updatedLines.push(
						`${indent}ORDER BY ${this.params.sort.field} ${this.params.sort.direction}`,
					);
				}
				// Если this.params.sort === undefined, строка удаляется (не добавляется)
			} else {
				updatedLines.push(line);
			}
		}

		// Если параметр sort не был найден, но его нужно добавить
		if (!sortProcessed && this.params.sort) {
			// Ищем подходящее место для вставки (после mode, перед columns)
			const insertIndex = this.findSortInsertPosition(updatedLines);
			if (insertIndex !== -1) {
				// Определяем отступ на основе соседней строки
				const neighborLine = updatedLines[insertIndex];
				const indent = neighborLine?.match(/^(\s*)/)?.[1] || "";
				updatedLines.splice(
					insertIndex,
					0,
					`${indent}ORDER BY ${this.params.sort.field} ${this.params.sort.direction}`,
				);
			}
		}

		return updatedLines.join("\n");
	}

	/**
	 * Находит позицию для вставки параметра sort в блок
	 * @param lines Строки блока (без обратных кавычек)
	 * @returns Индекс для вставки или -1 если не найдено подходящее место
	 */
	private findSortInsertPosition(lines: string[]): number {
		// Ищем строки с SELECT, затем LIMIT
		let selectIndex = -1;
		let limitIndex = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line && line.trim().toUpperCase().startsWith("SELECT")) {
				selectIndex = i;
			} else if (line && line.trim().toUpperCase().startsWith("LIMIT")) {
				limitIndex = i;
				break;
			}
		}

		// Если нашли LIMIT, вставляем перед ним
		if (limitIndex !== -1) {
			return limitIndex;
		}

		// Если нашли SELECT, вставляем после него
		if (selectIndex !== -1) {
			return selectIndex + 1;
		}

		// Вставляем после первой непустой строки
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line?.trim() !== "") {
				return i + 1;
			}
		}

		// По умолчанию вставляем в конец
		return lines.length > 0 ? lines.length : 0;
	}
}
