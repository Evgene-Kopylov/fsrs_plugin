import { Notice, App } from "obsidian";
import {
	parseModernFsrsFromFrontmatter,
	addReviewSession,
	getCardYamlAfterReview,
	getNextReviewDates,
} from "../utils/fsrs-helper";
import type { ModernFSRSCard, FSRSRating } from "../interfaces/fsrs";
import type MyPlugin from "../main";

/**
 * Показывает модальное окно для выбора оценки карточки
 */
class ReviewModal {
	private app: App;
	private plugin: MyPlugin;
	private card: ModernFSRSCard;
	private resolve: (rating: FSRSRating | null) => void;

	constructor(app: App, plugin: MyPlugin, card: ModernFSRSCard) {
		this.app = app;
		this.plugin = plugin;
		this.card = card;
	}

	async show(): Promise<FSRSRating | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;

			// Создаем модальное окно
			const modal = this.app.workspace.activeLeaf
				? new (
						this.app as any
					).workspace.activeLeaf.view.container.createDiv()
				: document.createElement("div");

			modal.style.cssText = `
				position: fixed;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%);
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				padding: 20px;
				z-index: 1000;
				box-shadow: 0 4px 20px rgba(0,0,0,0.3);
				min-width: 300px;
			`;

			// Заголовок
			const title = document.createElement("h3");
			title.textContent = "Повторение карточки";
			title.style.marginTop = "0";
			modal.appendChild(title);

			// Информация о карточке
			const info = document.createElement("div");
			info.innerHTML = `
				<small>
					<strong>Файл:</strong> ${this.card.filePath}<br>
					<strong>Сессий:</strong> ${this.card.reviews.length}<br>
					<strong>Последняя:</strong> ${
						this.card.reviews.length > 0
							? new Date(
									this.card.reviews[
										this.card.reviews.length - 1
									]!.date,
								).toLocaleString()
							: "нет"
					}
				</small>
				<hr>
			`;
			modal.appendChild(info);

			// Кнопки оценок
			const ratings: {
				rating: FSRSRating;
				label: string;
				color: string;
			}[] = [
				{
					rating: "Again",
					label: "Again (1)",
					color: "var(--color-red)",
				},
				{
					rating: "Hard",
					label: "Hard (2)",
					color: "var(--color-orange)",
				},
				{
					rating: "Good",
					label: "Good (3)",
					color: "var(--color-green)",
				},
				{
					rating: "Easy",
					label: "Easy (4)",
					color: "var(--color-blue)",
				},
			];

			const buttonContainer = document.createElement("div");
			buttonContainer.style.display = "flex";
			buttonContainer.style.gap = "10px";
			buttonContainer.style.flexWrap = "wrap";
			buttonContainer.style.justifyContent = "center";

			ratings.forEach(({ rating, label, color }) => {
				const button = document.createElement("button");
				button.textContent = label;
				button.style.cssText = `
					flex: 1;
					min-width: 120px;
					padding: 10px 15px;
					background: ${color};
					color: white;
					border: none;
					border-radius: 4px;
					cursor: pointer;
					font-weight: bold;
					transition: opacity 0.2s;
				`;

				button.onmouseenter = () => (button.style.opacity = "0.8");
				button.onmouseleave = () => (button.style.opacity = "1");

				button.onclick = () => {
					this.resolve(rating);
					modal.remove();
				};

				buttonContainer.appendChild(button);
			});

			modal.appendChild(buttonContainer);

			// Кнопка отмены
			const cancelButton = document.createElement("button");
			cancelButton.textContent = "Отмена";
			cancelButton.style.cssText = `
				margin-top: 15px;
				width: 100%;
				padding: 8px;
				background: var(--background-modifier-border);
				color: var(--text-normal);
				border: none;
				border-radius: 4px;
				cursor: pointer;
			`;

			cancelButton.onclick = () => {
				this.resolve(null);
				modal.remove();
			};

			modal.appendChild(cancelButton);

			// Добавляем затемнение фона
			const overlay = document.createElement("div");
			overlay.style.cssText = `
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				background: rgba(0,0,0,0.5);
				z-index: 999;
			`;

			overlay.onclick = () => {
				this.resolve(null);
				modal.remove();
				overlay.remove();
			};

			document.body.appendChild(overlay);
			document.body.appendChild(modal);
		});
	}
}

/**
 * Повторяет текущую активную карточку FSRS с выбранной оценкой
 * @param app - Экземпляр приложения Obsidian
 * @param plugin - Экземпляр плагина FSRS
 * @returns Promise<void>
 */
export async function reviewCurrentCard(
	app: App,
	plugin: MyPlugin,
): Promise<void> {
	try {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return;
		}

		const content = await app.vault.read(activeFile);

		// Ищем frontmatter
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(content);

		if (!match || !match[1]) {
			new Notice("Файл не содержит frontmatter");
			return;
		}

		const frontmatter = match[1];

		// Парсим карточку в новом формате
		const parseResult = parseModernFsrsFromFrontmatter(
			frontmatter,
			activeFile.path,
		);

		if (!parseResult.success || !parseResult.card) {
			new Notice(
				parseResult.error || "Не удалось распарсить карточку FSRS",
			);
			return;
		}

		const card = parseResult.card;

		// Проверяем, включен ли SRS для этой карточки
		if (!card.srs) {
			new Notice("SRS не включен для этой карточки");
			return;
		}

		console.log("Карточка для повторения:", card);

		// Показываем модальное окно для выбора оценки
		const modal = new ReviewModal(app, plugin, card);
		const rating = await modal.show();

		if (!rating) {
			new Notice("Повторение отменено");
			return;
		}

		console.log("Выбранная оценка:", rating);

		// Добавляем сессию повторения
		const updatedCard = await addReviewSession(
			card,
			rating,
			plugin.settings,
		);

		console.log("Обновленная карточка:", updatedCard);

		// Получаем YAML с обновленными полями
		const updatedYaml = await getCardYamlAfterReview(
			card,
			rating,
			plugin.settings,
		);

		// Заменяем старый frontmatter на новый
		const newContent = content.replace(
			frontmatterRegex,
			"---\n" + updatedYaml + "\n---",
		);

		// Сохраняем изменения
		await app.vault.modify(activeFile, newContent);

		// Получаем следующие даты повторения
		const nextDates = await getNextReviewDates(
			updatedCard,
			plugin.settings,
		);

		// Показываем уведомление с информацией
		let message = `Карточка повторена: ${rating}`;
		if (nextDates[rating]) {
			const nextDate = new Date(nextDates[rating]!);
			message += `\nСледующее повторение: ${nextDate.toLocaleDateString()}`;
		}

		new Notice(message);
		console.log("Карточка успешно обновлена");

		// Логируем следующие даты для всех оценок
		console.log("Следующие даты повторения:");
		Object.entries(nextDates).forEach(([rating, date]) => {
			if (date) {
				console.log(`  ${rating}: ${new Date(date).toLocaleString()}`);
			}
		});
	} catch (error) {
		console.error("Ошибка при повторении карточки:", error);
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		new Notice("Ошибка при повторении карточки: " + errorMessage);
	}
}

/**
 * Упрощенная версия для обратной совместимости (использует фиксированную оценку Good)
 * @deprecated Используйте reviewCurrentCard с выбором оценки
 */
export async function reviewCurrentCardSimple(app: App): Promise<void> {
	try {
		const activeFile = app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("Нет активного файла");
			return;
		}

		const content = await app.vault.read(activeFile);

		// Ищем frontmatter
		const frontmatterRegex = /^---\s*$([\s\S]*?)^---\s*$/m;
		const match = frontmatterRegex.exec(content);

		if (!match || !match[1]) {
			new Notice("Файл не содержит frontmatter");
			return;
		}

		const frontmatter = match[1];

		// Пробуем распарсить в старом формате
		const legacyMatch = /^fsrs_due:/m.test(frontmatter);
		if (legacyMatch) {
			new Notice(
				"Используется старый формат карточки. Обновите карточку.",
			);
			return;
		}

		// Парсим в новом формате
		const parseResult = parseModernFsrsFromFrontmatter(
			frontmatter,
			activeFile.path,
		);

		if (!parseResult.success || !parseResult.card) {
			new Notice(
				parseResult.error || "Не удалось распарсить карточку FSRS",
			);
			return;
		}

		const card = parseResult.card;

		if (!card.srs) {
			new Notice("SRS не включен для этой карточки");
			return;
		}

		// Используем фиксированную оценку Good
		const rating: FSRSRating = "Good";

		// Для простой версии создаем минимальные настройки
		const defaultSettings = {
			parameters: {
				request_retention: 0.9,
				maximum_interval: 36500,
				enable_fuzz: true,
			},
			default_initial_stability: 0.0,
			default_initial_difficulty: 0.0,
		} as any;

		const updatedCard = await addReviewSession(
			card,
			rating,
			defaultSettings,
		);
		const updatedYaml = await getCardYamlAfterReview(
			card,
			rating,
			defaultSettings,
		);

		const newContent = content.replace(
			frontmatterRegex,
			"---\n" + updatedYaml + "\n---",
		);

		await app.vault.modify(activeFile, newContent);
		new Notice(`Карточка повторена с оценкой: ${rating}`);
	} catch (error) {
		console.error("Ошибка в упрощенной версии:", error);
		new Notice("Ошибка при повторении карточки");
	}
}
