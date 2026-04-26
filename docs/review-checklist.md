obsidian-releases/review-checklist.md
# 👤 Чеклист самопроверки — человеческое ревью

Что обычно находят **Zachatoo**, **joethei** и **Fevol** (люди-ревьюеры), но не ловит автоматика.

Составлено на основе анализа десятков принятых PR в `obsidianmd/obsidian-releases`.

---

### 📄 1. Год в лицензии

> "Please update this to the current year (sorry for the wait!)"

- [ ] В файле `LICENSE` указан **текущий год**
- [ ] После нового года — не забудьте обновить

---

### 🏷️ 2. Нейминг — «Obsidian» в названиях

> "Naming something 'Obsidian xyz' is reserved for first party products we create."

- [ ] Заголовок `README.md` не начинается с `Obsidian`
- [ ] Допустимо: `Plugin Name — Obsidian plugin` или `Plugin Name for Obsidian`
- [ ] Название команды/команды в коде не содержит `Obsidian` как префикс

---

### 🗂️ 3. Кастомные ItemView

> "Avoid managing references to custom views"

- [ ] Нет ручного хранения ссылки: `plugin.view = myView`
- [ ] Доступ к вьюхе через `Plugin.getViewPlugin()` или `Workspace.getActiveViewOfType()`

---

### 📌 4. Регистрация всех событий

> "Events need to be registered, so they can be properly unloaded when the plugin is disabled."

- [ ] `this.app.metadataCache.on(...)` — через `this.registerEvent()`
- [ ] `this.app.vault.on(...)` — через `this.registerEvent()`
- [ ] `this.app.workspace.on(...)` — через `this.registerEvent()`
- [ ] `document.addEventListener(...)` — через `this.registerDomEvent()`
- [ ] `window.setInterval(...)` — через `this.registerInterval()`
- [ ] Любые кастомные `EventEmitter / EventRef` — зарегистрированы

---

### 🖼️ 5. Иконки

> "Use `addIcon()` and `setIcon()` to configure and add icons."

- [ ] Нет ручного создания SVG: `document.createElementNS('http://www.w3.org/2000/svg', ...)`
- [ ] Кастомные иконки добавлены через `this.addIcon('icon-id', svgString)`
- [ ] Отображение через `setIcon(element, 'icon-id')`
- [ ] Проверено — нет ли готовой иконки в Obsidian: [список](https://fevol.github.io/obsidian-notes/utils/icons/)

---

### 🎨 6. Прямые CSS-стили (пропущенные линтером)

> "Avoid setting styles directly via `element.style.*`. Use CSS classes."

- [ ] Нет `el.style.cursor`
- [ ] Нет `el.style.position`, `el.style.top/left/bottom/right`
- [ ] Нет `el.style.display`, `el.style.visibility`
- [ ] Нет `el.style.margin*`, `el.style.padding*`
- [ ] Нет `el.style.color`, `el.style.fontSize`
- [ ] Нет `el.style.transition`, `el.style.transform`
- [ ] Нет `el.style.flex*`, `el.style.gap`, `el.style.alignItems`, `el.style.justifyContent`
- [ ] Нет `el.style.width`, `el.style.textAlign`
- [ ] Нет `el.style.border*`, `el.style.boxShadow`
- [ ] Используются CSS-классы и/или `setCssProps()`

---

### 🔧 7. Кастомные тултипы

> "Please use `setTooltip()` or `displayTooltip()` instead of implementing your own tooltip."

- [ ] Нет самодельных тултипов (создание `div`, показ/скрытие по hover)
- [ ] Используется `el.setTooltip('text')` или `displayTooltip(el, 'text')`

---

### ⚙️ 8. Настройки (Settings tab)

> "Don't add a top-level heading in the settings tab. Only use headings if you have more than one section."

- [ ] Нет заголовка с именем плагина как первого элемента в настройках
- [ ] Если секций больше одной — используется `new Setting(containerEl).setName('...').setHeading()`
- [ ] Нет пустых `Setting()` без `.setName()`

---

### 📱 9. `isDesktopOnly`

> "Nothing in your plugin would prevent it from working on mobile, if you wanted to you could set this to `false`."

- [ ] Если плагин работает на мобильных — `"isDesktopOnly": false` в `manifest.json`
- [ ] Если `true` — есть реальное обоснование (child_process, Node API, нативные модули и т.п.)
- [ ] `"isDesktopOnly": true` **не** стоит просто потому что «не тестировал на мобилках»

---

### 🔍 10. Парсинг заголовков / метаданных

> "Please use `MetadataCache.getFileCache` instead of regex."

- [ ] Нет парсинга markdown-заголовков через `line.match(/^#{1,6}.../)`
- [ ] Используется `this.app.metadataCache.getFileCache(file)?.headings`
- [ ] Нет парсинга фронтматеры вручную — используйте `metadataCache.getCache(file)?.frontmatter`

---

### 🧹 11. Мёртвый код после исправлений

> "Please remove this since you aren't using it anymore"

- [ ] Удалены неиспользуемые переменные, поля, методы, импорты
- [ ] Проверено после всех исправлений по замечаниям бота
- [ ] Особенно: массивы для cleanup, которые уже не нужны, если используете `registerEvent`

---

### 🔄 12. onunload — `detachLeaves`

> "Don't detach leaves in onunload, as that will reset the leaf to its default location."

- [ ] Нет `this.app.workspace.detachLeavesOfType(...)` в `onunload`
- [ ] Вместо этого — восстановите исходное состояние leaf, если нужно

---

### 🔌 13. Использование Node API / child_process

> (Проверяется ревьюером — если плагин использует нативные модули)

- [ ] `isDesktopOnly: true` стоит (иначе на мобильных упадёт)
- [ ] Если есть `child_process.spawn` — процесс корректно завершается в `onunload`
- [ ] Нет утечек процессов при перезагрузке плагина

---

### 🧪 14. Тестирование на нескольких платформах

> (Ревьюер может заметить неработающие фичи на непротестированной платформе)

- [ ] Если в чеклисте PR не отмечена какая-то платформа — будьте готовы, что спросят
- [ ] macOS, Windows, Linux, Android, iOS — отметьте хотя бы те, где реально тестировали

---

### 📖 15. README

- [ ] README.md на английском языке
- [ ] Описывает назначение плагина и инструкцию по использованию
- [ ] Указаны зависимости, если есть
- [ ] Скриншоты (если есть) — адекватного размера

---

### 👥 16. Transfer / смена владельца плагина

> (Редкий случай, но бывает)

- [ ] Если передаёте плагин — старый автор должен подтвердить в комментариях
- [ ] Новый репозиторий — форк старого, с тегом той же версии

---

### 📋 Сводка

| № | Проверка | Бот | Человек |
|---|----------|:---:|:-------:|
| 1 | Год в лицензии | ✗ | ✓ |
| 2 | Нейминг «Obsidian» | ✗ | ✓ |
| 3 | Ручные ссылки на View | ✗ | ✓ |
| 4 | Незарегистрированные события | ✗ | ✓ |
| 5 | SVG-иконки вместо `addIcon()` | ✗ | ✓ |
| 6 | Прямые CSS-стили (пропущенные) | ✗ | ✓ |
| 7 | Самописные тултипы | ✗ | ✓ |
| 8 | Заголовок в настройках | ✗ | ✓ |
| 9 | `isDesktopOnly` не по делу | ✗ | ✓ |
| 10 | Парсинг регулярками | ✗ | ✓ |
| 11 | Мёртвый код | ✗ | ✓ |
| 12 | `detachLeaves` в onunload | ✗ | ✓ |
| 13 | Node API / child_process | ✗ | ✓ |
| 14 | Тестирование на платформах | ✗ | ✓ |
| 15 | README | ✗ | ✓ |
| 16 | Transfer плагина | ✗ | ✓ |

> Ни один из этих пунктов не проверяется автоматикой — это зона ответственности человека-ревьюера.