# Использование парсинга frontmatter

Сканирование хранилища (`performCacheScan`) больше не парсит frontmatter — использует `metadataCache.frontmatter.reviews` напрямую.

Ниже перечислены места, где парсинг ещё применяется.

## `parseCardDataFromFrontmatter` (WASM)

Извлекает FSRS-карточку из YAML-строки через WASM.

| Файл | Функция | Зачем |
| ------ | --------- | ------- |
| `src/main.ts` | `scanSingleCard()` | Обновление одной карточки при изменении/удалении файла |
| `src/commands/review/review-card.ts` | `reviewCardByFile()` | Рецензирование карточки |
| `src/commands/review/delete-last-review.ts` | `deleteLastReview()` | Удаление последнего повторения |
| `src/ui/review-button-renderer.ts` | `updateButtonState()`, `handleMainButtonClick()` | Обновление и обработка кнопки повторения |
| `src/ui/review-history-modal.ts` | `loadCardData()` | Загрузка истории повторений |
| `src/ui/status-bar-manager.ts` | `updateStatusBar()` | Обновление статус-бара |

## `extractFrontmatter` / `extractFrontmatterWithMatch` (регулярка)

Извлекает сырой текст frontmatter между `---`.

| Файл | Функция | Зачем |
| ------ | --------- | ------- |
| `src/main.ts` | `scanSingleCard()` | Извлечение frontmatter для передачи в WASM |
| `src/commands/add-default-table.ts` | `addDefaultTableToContent()` | Вставка блока `fsrs-table` после frontmatter |
| `src/commands/add-fsrs-fields.ts` | `addFsrsFieldsToCurrentFile()` | Добавление FSRS-полей в frontmatter (через `process`) |
| `src/commands/add-review-button.ts` | `insertReviewButton()` | Вставка кнопки после frontmatter (через `process`) |
| `src/commands/review/review-card.ts` | `reviewCardByFile()` | Извлечение для рецензирования (через `read` + `process`) |
| `src/commands/review/delete-last-review.ts` | `deleteLastReview()` | Извлечение для удаления повторения (через `read` + `process`) |
| `src/ui/review-button-renderer.ts` | `updateButtonState()`, `handleMainButtonClick()` | Извлечение для кнопки |
| `src/ui/review-history-modal.ts` | `loadCardData()` | Извлечение для истории |
| `src/ui/status-bar-manager.ts` | `updateStatusBar()` | Извлечение для статус-бара |

## Итого

- `parseCardDataFromFrontmatter` — 6 мест (только для чтения/записи одной карточки)
- `extractFrontmatter` / `extractFrontmatterWithMatch` — 9 мест (в основном для вставки/редактирования frontmatter через `process`)
- Сам модуль: `src/utils/fsrs/fsrs-parser.ts` + `src/utils/fsrs/fsrs-frontmatter.ts`

Сканирование хранилища — единственный путь, где парсинг **полностью заменён** на metadataCache.
