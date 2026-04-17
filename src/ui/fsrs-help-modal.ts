import { Modal, App, MarkdownRenderer } from "obsidian";
import { AVAILABLE_FIELDS } from "../utils/fsrs-table-params";

/**
 * Генерирует строку колонок для примера полной таблицы
 * file as "📄", остальные поля с первой буквой названия в верхнем регистре
 */
function generateFullExampleColumns(): string {
	const columns: string[] = [];
	// file с иконкой
	columns.push('file as "📄"');

	// остальные поля с первой буквой в верхнем регистре
	const otherFields = Array.from(AVAILABLE_FIELDS)
		.filter((f) => f !== "file")
		.sort();
	for (const field of otherFields) {
		const firstLetter = field.charAt(0).toUpperCase();
		columns.push(`${field} as "${firstLetter}"`);
	}
	return columns.join(", ");
}

/**
 * Генерирует текст справки по синтаксису fsrs-table
 * Содержит Markdown с экранированными обратными кавычками
 */
function generateHelpText(): string {
	// Карта описаний полей (гарантирует актуальность списка)
	const fieldDescMap: Record<string, string> = {
		file: "Имя файла карточки (кликабельная ссылка)",
		reps: "Количество выполненных повторений",
		overdue: "Дней просрочки (только для режима due)",
		stability:
			"Стабильность карточки (S) — параметр FSRS, определяет интервал роста",
		difficulty: "Сложность карточки (D) — значение от 0 до 10",
		retrievability:
			"Извлекаемость (R) — вероятность правильного ответа в данный момент",
		due: "Дата и время следующего повторения",
		state: "Состояние карточки: New, Learning, Review, Relearning",
		elapsed: "Дней с последнего повторения",
		scheduled: "Дней до следующего повторения (только для режима future)",
	};

	// Отсортированный список полей
	const sortedFields = Array.from(AVAILABLE_FIELDS).sort();

	// Пример актуальной выборки (режим due с полезными полями)
	const actualExample = `\\\`\\\`\\\`fsrs-table
mode: due
limit: 20
columns: file as "Файл", reps as "Повт.", overdue as "Просрочка", retrievability as "Доступность"
\\\`\\\`\\\``;

	// Пример полной таблицы (все поля с иконками)
	const fullExampleColumns = generateFullExampleColumns();
	const fullExample = `\\\`\\\`\\\`fsrs-table
mode: all
columns: ${fullExampleColumns}
\\\`\\\`\\\``;

	return `# Справка по синтаксису fsrs-table

## Примеры

### Актуальная выборка (просроченные карточки)
${actualExample}

### Полная таблица (все поля)
${fullExample}

## Доступные поля (columns)
${sortedFields
	.map(
		(field) =>
			`1. **\`${field}\`** — ${fieldDescMap[field] || "Описание отсутствует"}`,
	)
	.join("\n")}

## Параметры
- **\`mode: due|future|all\`** — режим отображения (обязательный)
- **\`limit: число\`** — ограничение количества строк (0 = используется значение из настроек плагина, обычно 30)
- **\`columns: поле1, поле2 as "Заголовок", ...\`** — настройка колонок и их заголовков

### Формат параметра \`columns\`
\\\`\\\`\\\`
columns: file, reps as "Повторений", stability, difficulty as "Сложность"
\\\`\\\`\\\`
- Поля перечисляются через запятую
- Можно задать кастомный заголовок с помощью \`as "Заголовок"\`
- Если заголовок не указан, используется заголовок по умолчанию
- Порядок колонок соответствует порядку в параметре

## Режимы отображения
- **\`mode: due\`** — карточки для повторения (по умолчанию)
- **\`mode: future\`** — карточки на будущее (следующее повторение запланировано)
- **\`mode: all\`** — все карточки независимо от состояния

## Общая информация
Блок \`fsrs-table\` отображает таблицу карточек FSRS с настраиваемыми колонками и фильтрацией.

Данные обновляются автоматически при открытии файла.

## Примечания
- Данные таблицы кэшируются и обновляются при открытии файла
- Клик по имени файла открывает соответствующую заметку
- Клик по строке таблицы также открывает файл
- Просроченные карточки сортируются по количеству дней просрочки
- Карточки на будущее сортируются по дате следующего повторения
- Все числовые значения округляются для лучшей читаемости`;
}

/**
 * Модальное окно для справки по синтаксису fsrs-table
 * Широкое окно с возможностью выделения текста для удобного копирования примеров
 */
export class FsrsHelpModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	/**
	 * Показывает модальное окно со справкой
	 */
	show(): void {
		this.open();
	}

	/**
	 * Вызывается при открытии модального окна
	 */
	onOpen(): void {
		const { contentEl, modalEl } = this;

		// Увеличиваем ширину модального окна
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		modalEl.style.width = "80%";
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		modalEl.style.maxWidth = "900px";
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		modalEl.style.maxHeight = "85vh";

		// Разрешаем выделение текста во всём контенте
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		modalEl.style.userSelect = "text";
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		contentEl.style.userSelect = "text";

		contentEl.empty();

		// Заголовок
		contentEl.createEl("h2", {
			text: "Справка по синтаксису fsrs-table",
			cls: "fsrs-help-title",
		});

		// Информационная строка
		const info = contentEl.createEl("div", { cls: "fsrs-help-info" });
		info.createEl("small", {
			text: "Используйте эту справку для настройки блоков fsrs-table в ваших заметках",
		});

		// Контейнер для Markdown контента с прокруткой
		const contentContainer = contentEl.createDiv({
			cls: "fsrs-help-content-container",
		});

		// Разрешаем выделение текста в контейнере
		// eslint-disable-next-line obsidianmd/no-static-styles-assignment
		contentContainer.style.userSelect = "text";

		// Рендерим Markdown контент
		void MarkdownRenderer.render(
			this.app,
			generateHelpText(),
			contentContainer,
			"",
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
			null as any,
		);

		// Кнопки действий
		const buttonContainer = contentEl.createDiv({
			cls: "fsrs-help-buttons",
		});

		// Создаём кнопку закрытия
		const closeButton = buttonContainer.createEl("button", {
			text: "Закрыть",
			cls: "mod-cta",
		});

		closeButton.addEventListener("click", () => {
			this.close();
		});

		// Фокус на кнопке закрытия для удобства навигации с клавиатуры
		closeButton.focus();

		// Обработка нажатия Escape для закрытия
		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				this.close();
			}
		};

		modalEl.addEventListener("keydown", handleKeydown);

		// Сохраняем обработчик для удаления при закрытии
		this.scope.register([], "keydown", handleKeydown);
	}

	/**
	 * Вызывается при закрытии модального окна
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
