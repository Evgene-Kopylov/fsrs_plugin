import { Modal, App, MarkdownRenderer } from "obsidian";
import { AVAILABLE_FIELDS } from "../utils/fsrs-table-params";

/**
 * Генерирует строку колонок для примера полной таблицы
 * file as "🗎", остальные поля с первой буквой названия в верхнем регистре
 */
function generateFullExampleColumns(): string {
	const columns: string[] = [];
	// file с иконкой
	columns.push('file as "🗎"');

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
		overdue: "Часов просрочки",
		stability:
			"Стабильность карточки (S) — параметр FSRS, определяет интервал роста",
		difficulty: "Сложность карточки (D) — значение от 0 до 10",
		retrievability:
			"Извлекаемость (R) — вероятность правильного ответа в данный момент",
		due: "Дата и время следующего повторения",
		state: "Состояние карточки: New, Learning, Review, Relearning",
		elapsed: "Дней с последнего повторения",
		scheduled: "Дней до следующего повторения",
	};

	// Отсортированный список полей
	const sortedFields = Array.from(AVAILABLE_FIELDS).sort();

	// Пример актуальной выборки с полезными полями
	const actualExample = `\\\`\\\`\\\`fsrs-table
SELECT file as "Файл", reps as "Повт.", overdue as "Просрочка", retrievability as "Доступность"
LIMIT 20
\\\`\\\`\\\``;

	// Пример сортировки по полю due в обратном порядке
	const sortExample = `\\\`\\\`\\\`fsrs-table
SELECT file as "Файл", reps as "Повт.", due as "Следующее повторение", state as "Состояние"
ORDER BY due DESC
LIMIT 20
\\\`\\\`\\\``;

	// Пример полной таблицы (все поля с иконками)
	const fullExampleColumns = generateFullExampleColumns();
	const fullExample = `\\\`\\\`\\\`fsrs-table
SELECT ${fullExampleColumns}
LIMIT 20
\\\`\\\`\\\``;

	return `# Справка по синтаксису fsrs-table

## Примеры

### Актуальная выборка (просроченные карточки)
${actualExample}

### Сортировка по полю
${sortExample}

### Полная таблица (все поля)
${fullExample}

## Доступные поля (columns)
${sortedFields
	.map(
		(field) =>
			`1. **\`${field}\`** — ${fieldDescMap[field] || "Описание отсутствует"}`,
	)
	.join("\n")}

## Параметры (SQL-синтаксис)

- **\`SELECT поле1, поле2 as "Заголовок", ...\`** — выбор полей для отображения
- **\`ORDER BY поле ASC|DESC\`** — сортировка по указанному полю (ASC - по возрастанию, DESC - по убыванию)
- **\`LIMIT число\`** — ограничение количества строк (0 = используется значение из настроек плагина, обычно 30)

### Формат параметра \`SELECT\`
\\\`\\\`\\\`
SELECT file, reps as "Повторений", stability, difficulty as "Сложность"
\\\`\\\`\\\`
- Поля перечисляются через запятую после ключевого слова SELECT
- Можно задать кастомный заголовок с помощью \`as "Заголовок"\`
- Если заголовок не указан, используется заголовок по умолчанию
- Порядок колонок соответствует порядку в параметре SELECT

### Формат параметра \`ORDER BY\`
\\\`\\\`\\\`
ORDER BY due DESC
ORDER BY file ASC
\\\`\\\`\\\`
- Поле для сортировки должно быть одним из доступных полей
- Направление сортировки: ASC (по возрастанию) или DESC (по убыванию)
- Если параметр ORDER BY не указан, используется сортировка по умолчанию (сначала due карточки, затем scheduled)
- Пользовательская сортировка переопределяет сортировку по умолчанию



## Общая информация
Блок \`fsrs-table\` отображает таблицу карточек FSRS с настраиваемыми колонками и сортировкой.

Данные обновляются автоматически при открытии файла.

## Примечания
- Данные таблицы кэшируются и обновляются при открытии файла
- Клик по имени файла открывает соответствующую заметку
- Клик по строке таблицы также открывает файл
- Без указания параметра ORDER BY:
  - Просроченные карточки сортируются по приоритету (извлекаемость)
  - Запланированные карточки сортируются по дате следующего повторения
- С параметром ORDER BY используется указанная пользователем сортировка
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
	}

	/**
	 * Вызывается при закрытии модального окна
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
