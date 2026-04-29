# Кнопки сброса для всех настроек

**Суть:** У каждой настройки в плагине должна быть кнопка сброса к значению по умолчанию (`addExtraButton` с иконкой `reset`). Сейчас кнопка есть только у `custom_button_labels`.

## Группы настроек

### `fsrs-parameters.ts`
- `request_retention` (default: 0.9) — slider
- `maximum_interval` (default: 36500) — text
- `enable_fuzz` (default: true) — toggle

### `card-defaults.ts`
- `default_initial_stability` (default: 0.0) — text
- `default_initial_difficulty` (default: 0.0) — text

### `display-settings.ts`
- `auto_add_review_button` (default: false) — toggle
- `status_bar_icon` (default: "🔄") — text
- `verbose_logging` (default: false) — toggle

### `filtering-settings.ts`
- `ignore_patterns` (default: []) — textarea
