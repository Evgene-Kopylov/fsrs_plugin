import { MarkdownRenderChild, Notice, EventRef } from "obsidian";
import type FsrsPlugin from "../main";
import type { TableParams, TableMode } from "../utils/fsrs-table-helpers";
import {
	parseTableParams,
	generateTableHTMLFromCards,
	generateEmptyTableHTML,
} from "../utils/fsrs-table-helpers";
import { FsrsHelpModal } from "./fsrs-help-modal";

/**
 * Класс для динамического рендеринга универсального блока fsrs-table
 * Поддерживает режимы отображения: due (просроченные), all (все карточки)
 */
export class FsrsTableRenderer extends MarkdownRenderChild {
	private params: TableParams;
	private isFirstLoad = true;
	private activeLeafHandler?: EventRef;
	private activeLeafCallback?: () => void;
	private lastVisibilityUpdate = 0;
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
		this.params = parseTableParams(source);
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
			// При первом показе используем индикатор загрузки
			if (this.isFirstLoad) {
				this.showLoadingIndicator();
			} else {
				// При последующих обновлениях применяем плавную анимацию opacity
				this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
				this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			}

			// Получаем все карточки через плагин
			const allCards = await this.plugin.getCardsForReview();
			const now = new Date();

			if (allCards.length === 0) {
				this.renderEmptyState();
				return;
			}

			// Генерируем HTML таблицы
			const html = await generateTableHTMLFromCards(
				allCards,
				this.params,
				this.plugin.settings,
				this.plugin.app,
				now,
			);

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
				`⏱️ Загрузка таблицы FSRS (режим ${this.params.mode}): ${elapsedSec.toFixed(2)} с`,
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

		const emptyHTML = generateEmptyTableHTML(this.params.mode);
		// eslint-disable-next-line @microsoft/sdl/no-inner-html
		this.container.insertAdjacentHTML("afterbegin", emptyHTML);

		if (!this.isFirstLoad) {
			this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
	}

	/**
	 * Отображает состояние ошибки
	 */
	private renderErrorState(error: unknown) {
		console.error(
			`Ошибка при рендеринге блока fsrs-table (режим ${this.params.mode}):`,
			error,
		);
		const errorMessage =
			error instanceof Error ? error.message : String(error);

		// При ошибке также применяем анимацию, если это не первый показ
		if (!this.isFirstLoad) {
			this.container.style.opacity = "0.7"; // eslint-disable-line obsidianmd/no-static-styles-assignment
			this.container.style.transition = "opacity 0.3s ease"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
		this.container.empty();

		const errorDiv = this.container.createDiv({ cls: "fsrs-table-error" });
		errorDiv.createEl("small", {
			text: `Error loading FSRS table: ${errorMessage}`,
		});

		if (!this.isFirstLoad) {
			this.container.style.opacity = "1"; // eslint-disable-line obsidianmd/no-static-styles-assignment
		}
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

		// Обработчик для кнопок сортировки в заголовках таблицы
		this.container
			.querySelectorAll(".fsrs-sort-button")
			.forEach((button) => {
				button.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					const field = (button as HTMLElement).dataset.field;
					if (field) {
						this.handleSortClick(field);
					}
				});
			});

		// Обработчик для кнопки помощи
		this.container
			.querySelectorAll(".fsrs-help-toggle")
			.forEach((button) => {
				button.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.showHelpModal();
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
		await this.renderContent();
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
	 * Возвращает режим отображения этого рендерера
	 */
	getMode(): TableMode {
		return this.params.mode;
	}

	/**
	 * Показывает модальное окно со справкой по синтаксису
	 */
	private showHelpModal() {
		const modal = new FsrsHelpModal(this.plugin.app);
		modal.show();
	}

	/**
	 * Обрабатывает клик на заголовок для сортировки
	 * @param field Поле, по которому нужно сортировать
	 */
	private async handleSortClick(field: string) {
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

		// Обновляем исходный код блока
		await this.updateSourceCode();

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
				this.params = parseTableParams(updatedInnerContent);
			}
		} catch (error) {
			console.error("Ошибка при обновлении исходного кода блока:", error);
		}
	}

	/**
	 * Получает содержимое блока из редактора по сохраненным позициям
	 */
	private getBlockContentFromEditor(editor: any): string | null {
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

			// Проверяем, является ли строка параметром sort
			if (trimmed.startsWith("sort:")) {
				sortProcessed = true;
				// Если есть параметр sort, добавляем или заменяем его
				if (this.params.sort) {
					const indent = line.match(/^(\s*)/)?.[1] || "";
					updatedLines.push(
						`${indent}sort: ${this.params.sort.field} ${this.params.sort.direction}`,
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
					`${indent}sort: ${this.params.sort.field} ${this.params.sort.direction}`,
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
		// Ищем строку с mode, затем ищем подходящее место после нее
		let modeIndex = -1;
		let columnsIndex = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line && line.trim().startsWith("mode:")) {
				modeIndex = i;
			} else if (line && line.trim().startsWith("columns:")) {
				columnsIndex = i;
				break;
			}
		}

		// Если нашли columns, вставляем перед ними
		if (columnsIndex !== -1) {
			return columnsIndex;
		}

		// Если нашли mode, вставляем после него
		if (modeIndex !== -1) {
			return modeIndex + 1;
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
