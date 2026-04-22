import { Modal, App, MarkdownRenderer } from "obsidian";
import { AVAILABLE_FIELDS } from "../utils/fsrs-table-params";
import { i18n } from "../utils/i18n";

/**
 * Собирает локализованный текст справки из файлов локализации
 */
function getLocalizedHelpText(): string {
    const sortedFields = Array.from(AVAILABLE_FIELDS).sort();

    const fieldsList = sortedFields
        .map((field) => {
            const desc = i18n.t(`help.available_fields.descriptions.${field}`, {
                defaultValue: "Description missing",
            });
            return `1. **\`${field}\`** — ${desc}`;
        })
        .join("\n");

    return `# ${i18n.t("help.title")}

## ${i18n.t("help.examples.heading")}

${i18n.t("help.examples.actual")}

${i18n.t("help.examples.sort")}

${i18n.t("help.examples.full")}

## ${i18n.t("help.available_fields.heading")}
${fieldsList}

## ${i18n.t("help.parameters.heading")}

- ${i18n.t("help.parameters.select")}
- ${i18n.t("help.parameters.select_star")}
- ${i18n.t("help.parameters.order_by")}
- ${i18n.t("help.parameters.limit")}

${i18n.t("help.parameters.select_format")}
${i18n.t("help.parameters.select_desc")}

${i18n.t("help.parameters.order_by_format")}
${i18n.t("help.parameters.order_by_desc")}

${i18n.t("help.parameters.notes")}

## ${i18n.t("help.general.heading")}

${i18n.t("help.general.description")}

${i18n.t("help.general.update_note")}

## ${i18n.t("help.general.notes.heading")}

- ${i18n.t("help.general.notes.cache")}
- ${i18n.t("help.general.notes.click_file")}
- ${i18n.t("help.general.notes.click_row")}
- ${i18n.t("help.general.notes.default_sort")}
- ${i18n.t("help.general.notes.custom_sort")}
- ${i18n.t("help.general.notes.rounding")}
`;
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
            text: i18n.t("help.title"),
            cls: "fsrs-help-title",
        });

        // Информационная строка
        const info = contentEl.createEl("div", { cls: "fsrs-help-info" });
        info.createEl("small", {
            text: i18n.t("help.intro"),
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
            getLocalizedHelpText(),
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
