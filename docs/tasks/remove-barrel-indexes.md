# Убрать barrel-файлы (index.ts-реэкспорты)

Barrel-файлы (`index.ts`, которые только реэкспортируют соседние модули) мешают прозрачности и сбивают с толку ts-prune.

## Что сделать

### 1. `settings/index.ts` — удалить

Текущая структура:
```
settings/
  index.ts             ← реэкспорт (удалить)
  types.ts             → FsrsPluginSettings, DEFAULT_SETTINGS
  settings-core.ts     → FsrsSettingTab
  setting-groups/      → render* функции
```

Заменить импорты:
- `main.ts`: `import { FsrsPluginSettings, DEFAULT_SETTINGS } from "./settings/types"`
- `main.ts`: `import { FsrsSettingTab } from "./settings/settings-core"`
- `add-fsrs-fields.ts`, `status-bar-manager.ts`: `import type { FsrsPluginSettings } from "../settings/types"`
- `fsrs-filter.ts`: `import type { FsrsPluginSettings } from "../../settings/types"`

Мёртвые реэкспорты `renderFsrsParameters`, `renderCardDefaults`, `renderDisplaySettings`, `renderFilteringSettings` из `index.ts` убрать (они и так импортируются напрямую внутри `settings-core.ts`).

### 2. `commands/review/index.ts` — удалить

Текущая структура:
```
commands/review/
  index.ts             ← реэкспорт (удалить)
  review-card.ts       → reviewCurrentCard, reviewCardByPath
  review-modal.ts      → ReviewModal
  delete-last-review.ts → deleteLastReview, deleteLastReviewCurrentCard
```

Заменить импорты:
- `main.ts`: `import { reviewCurrentCard, reviewCardByPath, deleteLastReview, deleteLastReviewCurrentCard } from "./commands/review/review-card"` и `from "./commands/review/delete-last-review"`
- `ui/review-button-renderer.ts` (если импортирует ReviewModal из `./review`): исправить на прямой путь

## Критерий готовности

- `ts-prune -p tsconfig.json | grep '^src/' | grep -v '(used in module)'` не показывает ложных срабатываний от settings и commands/review
