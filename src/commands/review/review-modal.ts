import { App } from "obsidian";
import type { ModernFSRSCard, FSRSRating } from "../../interfaces/fsrs";
import type MyPlugin from "../../main";

/**
 * Модальное окно для выбора оценки при повторении карточки
 */
export class ReviewModal {
	private app: App;
	private plugin: MyPlugin;
	private card: ModernFSRSCard;
	private resolve: (rating: FSRSRating | null) => void;

	constructor(app: App, plugin: MyPlugin, card: ModernFSRSCard) {
		this.app = app;
		this.plugin = plugin;
		this.card = card;
	}

	/**
	 * Показывает модальное окно и возвращает выбранную оценку или null при отмене
	 */
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
					overlay.remove();
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
				overlay.remove();
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
