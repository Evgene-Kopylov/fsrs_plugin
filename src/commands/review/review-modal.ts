import { Modal, App } from "obsidian";
import type { ModernFSRSCard, FSRSRating } from "../../interfaces/fsrs";
import type MyPlugin from "../../main";

/**
 * Модальное окно для выбора оценки при повторении карточки
 * Использует стандартный API Obsidian Modal
 */
export class ReviewModal extends Modal {
	private plugin: MyPlugin;
	private card: ModernFSRSCard;
	private resolve: (rating: FSRSRating | null) => void;
	private ratingSelected: boolean = false;

	constructor(app: App, plugin: MyPlugin, card: ModernFSRSCard) {
		super(app);
		this.plugin = plugin;
		this.card = card;
	}

	/**
	 * Показывает модальное окно и возвращает выбранную оценку или null при отмене
	 */
	async show(): Promise<FSRSRating | null> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	/**
	 * Вызывается при открытии модального окна
	 */
	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Заголовок
		contentEl.createEl("h3", { text: "Повторение карточки" });

		// Информация о карточке
		const info = contentEl.createEl("div");
		info.innerHTML = `
			<small>
				<strong>Файл:</strong> ${this.card.filePath}<br>
				<strong>Сессий:</strong> ${this.card.reviews.length}<br>
				<strong>Последняя:</strong> ${
					this.card.reviews.length > 0
						? new Date(
								this.card.reviews[this.card.reviews.length - 1]!
									.date,
							).toLocaleString()
						: "нет"
				}
			</small>
			<hr>
		`;

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

		const buttonContainer = contentEl.createEl("div");
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
				this.ratingSelected = true;
				this.resolve(rating);
				this.close();
			};

			buttonContainer.appendChild(button);
		});

		// Кнопка отмены
		const cancelButton = contentEl.createEl("button", { text: "Отмена" });
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
			this.close();
		};
	}

	/**
	 * Вызывается при закрытии модального окна
	 */
	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();

		// Если окно закрыто без выбора оценки (например, нажатием Esc)
		if (!this.ratingSelected) {
			this.resolve(null);
		}
	}
}
