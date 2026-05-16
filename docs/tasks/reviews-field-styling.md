# Стилизация поля reviews во фронтматтере

## Проблема

Поле `reviews` — массив объектов во frontmatter YAML:

```yaml
reviews:
  - date: 2025-01-01T12:00:00Z
    rating: 3
  - date: 2025-01-02T12:00:00Z
    rating: 2
```

Obsidian не рендерит вложенные YAML-поля — показывает сырой строкой рыжего цвета. Выглядит некрасиво, занимает много места, не несёт пользы при беглом просмотре.

## Что нужно

Скрыть сырое содержимое `reviews`, заменить на цветные плиточки — по одной на повторение.

Цвета плиточек — как кнопки повторения: кастомный из настроек `customButtonColors`, фолбэк `var(--fsrs-color-{rating})`.

При наведении на плиточку — мгновенный тултип в стилистике хитмапа:
- дата без времени (`2025-01-01`)
- оценка цветным лейблом (классы `fsrs-heatmap-tip-rating fsrs-heatmap-tip-r{N}`)
- текст оценки: кастомный из `customButtonLabels`, фолбэк `numberToRating()`

Тултип — реальный DOM-элемент внутри плиточки, скрыт/показан через CSS `display`. Никаких `::after`, `title`, `data-` атрибутов.

Без плиточек — ничего не показывать (нативное значение видно). С плиточками — нативное значение скрыто.

## Подход

Завязаться на присутствие кнопки `fsrs-review-button` — тот же принцип, что и скрытие фронтматтера в предпросмотре. Стилизация живёт в `ReviewButtonRenderer`.

## Что переиспользовать

- `numberToRating()` из `interfaces/fsrs.ts` — число → строка оценки
- `numberToRating(r).toLowerCase()` — ключ для `customButtonColors`/`customButtonLabels`/CSS-переменной
- CSS-переменные `--fsrs-color-again`, `--fsrs-color-hard`, `--fsrs-color-good`, `--fsrs-color-easy`
- Классы хитмапа: `fsrs-heatmap-tip-rating`, `fsrs-heatmap-tip-r{N}` — для цветного лейбла в тултипе
- Стили тултипа: `background: var(--background-primary)`, `border-radius: 4px`, `padding: 4px 8px`, `font-size: 0.8em`, `box-shadow: 0 2px 8px rgba(0,0,0,0.15)`

## Чего избегать

- Новых констант `RATING_KEYS`, `RATING_LABELS`, `RATING_COLORS`
- Функций-дубликатов `resolveRatingLabel`, `resolveRatingColor`
- Хардкода цветов (`#e53935`, `#999`, etc.)
- `!important` в CSS
- `::after` для тултипов (клипятся `overflow: hidden` предков)
- `title` для тултипов (задержка браузера)

## CSS

Нужны стили для:

- Скрытие `.metadata-property-value` внутри `[data-property-key="reviews"]`
- `overflow: visible` на `.metadata-property` и `.metadata-container` при наличии стилизации
- Плиточки: `display: inline-flex; flex-wrap: wrap; gap: 2px`, квадратик 10×10, `border-radius: 2px`, `position: relative`
- Ховер плиточки: `outline` как в хитмапе
- Тултип внутри плиточки: спрятан, показан по `:hover`, стилистика хитмапа

## Критерий готовности

- Сырая YAML-строка `reviews` не видна в режиме чтения при наличии кнопки
- Вместо неё — цветные плиточки
- Тултип появляется мгновенно, стилистика хитмапа, дата без времени, оценка цветным лейблом
- Цвета и лейблы из настроек, фолбэк на CSS-переменные и `numberToRating()`
- Не ломает редактирование frontmatter в режиме исходника
- Не влияет на другие поля frontmatter
- stylelint чисто
