# Твикнуть окно предпросмотра из таблицы

## Проблема

При наведении на строку таблицы `fsrs-table` появляется окно предпросмотра (page preview). Фронтматтер (YAML-шапка) и свойства занимают место, контент не виден.

## Результат (✅)

CSS в `styles.css`:

```css
.hover-popover:has(.fsrs-review-button) .mod-header.mod-ui     { display: none; }
.hover-popover:has(.fsrs-review-button) .el-pre.mod-frontmatter { display: none; }
.hover-popover:has(.fsrs-review-button) .metadata-container     { display: none; }
```

- `:has(.fsrs-review-button)` — только попапы FSRS-карточек
- `.inline-title` оставлен — название заметки видно
- Без JS, чистый CSS

## Попытки, которые не сработали

### Увеличение высоты попапа

`min-height`/`max-height` на `.hover-popover` не дают эффекта — Obsidian/CodeMirror сами управляют высотой.

### Скролл попапа к кнопке/заголовку

JS (`mouseenter` + опрос + `scrollIntoView`/`scrollTop`) — нестабильно:
- попап перекрывает ссылку, `mouseover` не срабатывает
- `setTimeout`-опрос: тайминги плавают между файлами
- `getBoundingClientRect`/`offsetTop`: CodeMirror ломает цепочку offsetParent
- Кнопка глубоко в файле может не рендериться (CodeMirror virtual scroll)


### Планы и состояние

- Скрыть фронтматтер кажется полезным.
