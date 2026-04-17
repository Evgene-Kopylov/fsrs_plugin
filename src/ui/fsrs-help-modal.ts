import { Modal, App, MarkdownRenderer } from "obsidian";

/**
 * Константа с текстом справки по синтаксису fsrs-table
 * Содержит Markdown с экранированными обратными кавычками
 */
const FSRS_TABLE_HELP_TEXT = `# Справка по синтаксису fsrs-table

## Общая информация
Блок \`fsrs-table\` отображает таблицу карточек FSRS с настраиваемыми колонками и фильтрацией.

Данные обновляются автоматически при открытии файла.

## Режимы отображения
- **\`mode: due\`** — карточки для повторения (по умолчанию)
- **\`mode: future\`** — карточки на будущее (следующее повторение запланировано)
- **\`mode: all\`** — все карточки независимо от состояния

## Доступные поля (columns)
Каждое поле можно использовать в параметре \`columns\`:

1. **\`file\`** — Имя файла карточки (кликабельная ссылка)
2. **\`reps\`** — Количество выполненных повторений
3. **\`overdue\`** — Дней просрочки (только для режима \`due\`)
4. **\`stability\`** — Стабильность карточки (S) — параметр FSRS, определяет интервал роста
5. **\`difficulty\`** — Сложность карточки (D) — значение от 0 до 10
6. **\`retrievability\`** — Извлекаемость (R) — вероятность правильного ответа в данный момент
7. **\`due\`** — Дата и время следующего повторения
8. **\`state\`** — Состояние карточки: \`New\`, \`Learning\`, \`Review\`, \`Relearning\`
9. **\`elapsed\`** — Дней с последнего повторения
10. **\`scheduled\`** — Дней до следующего повторения (только для режима \`future\`)

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

## Примеры использования

### Пример 1: Все карточки с основными метриками
\\\`\\\`\\\`fsrs-table
mode: all
limit: 50
columns: file, reps as "Повт.", stability, difficulty, retrievability as "Доступность"
\\\`\\\`\\\`

### Пример 2: Просроченные карточки
\\\`\\\`\\\`fsrs-table
mode: due
columns: file, overdue, elapsed as "Прошло дней", due as "Следующее"
\\\`\\\`\\\`

### Пример 3: Карточки на будущее
\\\`\\\`\\\`fsrs-table
mode: future
limit: 10
columns: file, scheduled as "Через дней", due as "Запланировано"
\\\`\\\`\\\`

### Пример 4: Минимальная таблица (значения по умолчанию)
\\\`\\\`\\\`fsrs-table
mode: due
\\\`\\\`\\\`
*По умолчанию отображаются колонки: file, reps, overdue*

### Пример 5: Подробная таблица с состояниями
\\\`\\\`\\\`fsrs-table
mode: all
columns: file, state as "Состояние", reps, stability as "S", difficulty as "D", elapsed as "С последнего", due as "Следующее"
\\\`\\\`\\\`

## Примечания
- Данные таблицы кэшируются и обновляются при открытии файла
- Клик по имени файла открывает соответствующую заметку
- Клик по строке таблицы также открывает файл
- Просроченные карточки сортируются по количеству дней просрочки
- Карточки на будущее сортируются по дате следующего повторения
- Все числовые значения округляются для лучшей читаемости`;

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
			FSRS_TABLE_HELP_TEXT,
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
