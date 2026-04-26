obsidian-releases/review-checklist.md
# 👤 Чеклист самопроверки — человеческое ревью

Что обычно находят **Zachatoo**, **joethei** и **Fevol** (люди-ревьюеры), но не ловит автоматика.

Составлено на основе анализа десятков принятых PR в `obsidianmd/obsidian-releases`.

---

### 📄 1. Год в лицензии

> "Please update this to the current year (sorry for the wait!)"

- [x] В файле `LICENSE` указан **текущий год**
- [x] После нового года — не забудьте обновить
> добавлен copyright notice «Copyright (c) 2026 Evgene Kopylov» в LICENSE и wasm-lib/LICENSE. Коммит "fix: добавлен copyright notice с текущим годом в LICENSE"

---

### 🏷️ 2. Нейминг — «Obsidian» в названиях

> "Naming something 'Obsidian xyz' is reserved for first party products we create."

- [x] Заголовок `README.md` не начинается с `Obsidian`
- [x] Допустимо: `Plugin Name — Obsidian plugin` или `Plugin Name for Obsidian`
- [x] Название команды/команды в коде не содержит `Obsidian` как префикс
> заголовок "FSRS for Obsidian" — не начинается с "Obsidian". Команды с префиксом "FSRS:". OK.

---

### 🗂️ 3. Кастомные ItemView

> "Avoid managing references to custom views"

- [x] Нет ручного хранения ссылки: `plugin.view = myView`
- [x] Доступ к вьюхе через `Plugin.getViewPlugin()` или `Workspace.getActiveViewOfType()`
> ItemView не используются. Рендереры — MarkdownRenderChild, получают плагин через конструктор.

---

### 📌 4. Регистрация всех событий

> "Events need to be registered, so they can be properly unloaded when the plugin is disabled."

- [x] `this.app.metadataCache.on(...)` — через `this.registerEvent()`
- [x] `this.app.vault.on(...)` — через `this.registerEvent()`
- [x] `this.app.workspace.on(...)` — через `this.registerEvent()`
- [x] `document.addEventListener(...)` — через `this.registerDomEvent()`
- [x] `window.setInterval(...)` — через `this.registerInterval()`
- [x] Любые кастомные `EventEmitter / EventRef` — зарегистрированы
> исправлены два незарегистрированных события: `workspace.on("active-leaf-change")` в fsrs-table-renderer.ts обёрнут в registerEvent; `vault.on("modify")` в review-button-renderer.ts обёрнут в registerEvent. Коммит "fix: регистрация событий через registerEvent в рендерерах"

---

### 🖼️ 5. Иконки

> "Use `addIcon()` and `setIcon()` to configure and add icons."

- [x] Нет ручного создания SVG: `document.createElementNS('http://www.w3.org/2000/svg', ...)`
- [x] Кастомные иконки добавлены через `this.addIcon('icon-id', svgString)`
- [x] Отображение через `setIcon(element, 'icon-id')`
- [x] Проверено — нет ли готовой иконки в Obsidian: [список](https://fevol.github.io/obsidian-notes/utils/icons/)
> иконок в порядке: используется только `setIcon("plus")` — стандартная иконка Obsidian. Кастомные SVG не найдены.

---

### 🎨 6. Прямые CSS-стили (пропущенные линтером)

> "Avoid setting styles directly via `element.style.*`. Use CSS classes."

- [x] Нет `el.style.cursor`
- [x] Нет `el.style.position`, `el.style.top/left/bottom/right`
- [x] Нет `el.style.display`, `el.style.visibility`
- [x] Нет `el.style.margin*`, `el.style.padding*`
- [x] Нет `el.style.color`, `el.style.fontSize`
- [x] Нет `el.style.transition`, `el.style.transform`
- [x] Нет `el.style.flex*`, `el.style.gap`, `el.style.alignItems`, `el.style.justifyContent`
- [x] Нет `el.style.width`, `el.style.textAlign`
- [x] Нет `el.style.border*`, `el.style.boxShadow`
- [x] Используются CSS-классы и/или `setCssProps()`
> прямых CSS-стилей через `el.style.*` не обнаружено. Везде используются CSS-классы.

---

### 🔧 7. Кастомные тултипы

> "Please use `setTooltip()` or `displayTooltip()` instead of implementing your own tooltip."

- [x] Нет самодельных тултипов (создание `div`, показ/скрытие по hover)
- [x] Используется `el.setTooltip('text')` или `displayTooltip(el, 'text')`
> самодельных тултипов нет. Единственный тултип — стандартный HTML `title` на кнопке истории.

---

### ⚙️ 8. Настройки (Settings tab)

> "Don't add a top-level heading in the settings tab. Only use headings if you have more than one section."

- [x] Нет заголовка с именем плагина как первого элемента в настройках
- [x] Если секций больше одной — используется `new Setting(containerEl).setName('...').setHeading()`
- [x] Нет пустых `Setting()` без `.setName()`
> первый элемент — Language (setHeading). Секции через setHeading(). Пустых Setting() нет.

---

### 📱 9. `isDesktopOnly`

> "Nothing in your plugin would prevent it from working on mobile, if you wanted to you could set this to `false`."

- [x] Если плагин работает на мобильных — `"isDesktopOnly": false` в `manifest.json`
- [x] Если `true` — есть реальное обоснование (child_process, Node API, нативные модули и т.п.)
- [x] `"isDesktopOnly": true` **не** стоит просто потому что «не тестировал на мобилках»
> `isDesktopOnly: false` — корректно. Плагин использует WASM (не Node API), работает на мобильных.

---

### 🔍 10. Парсинг заголовков / метаданных

> "Please use `MetadataCache.getFileCache` instead of regex."

- [x] Нет парсинга markdown-заголовков через `line.match(/^#{1,6}.../)`
- [x] Используется `this.app.metadataCache.getFileCache(file)?.headings`
- [x] Нет парсинга фронтматеры вручную — используйте `metadataCache.getCache(file)?.frontmatter`
> парсинг регулярками заголовков не обнаружен. Парсинг фронтматеры — через Rust/WASM, что соответствует архитектуре.

---

### 🧹 11. Мёртвый код после исправлений

> "Please remove this since you aren't using it anymore"

- [x] Удалены неиспользуемые переменные, поля, методы, импорты
- [x] Проверено после всех исправлений по замечаниям бота
- [x] Особенно: массивы для cleanup, которые уже не нужны, если используете `registerEvent`
> TS-компиляция и ESLint без ошибок. Мёртвого кода не обнаружено.

---

### 🔄 12. onunload — `detachLeaves`

> "Don't detach leaves in onunload, as that will reset the leaf to its default location."

- [x] Нет `this.app.workspace.detachLeavesOfType(...)` в `onunload`
- [x] Вместо этого — восстановите исходное состояние leaf, если нужно
> `detachLeavesOfType` не используется.

---

### 🔌 13. Использование Node API / child_process

> (Проверяется ревьюером — если плагин использует нативные модули)

- [x] `isDesktopOnly: true` стоит (иначе на мобильных упадёт)
- [x] Если есть `child_process.spawn` — процесс корректно завершается в `onunload`
- [x] Нет утечек процессов при перезагрузке плагина
> Node API / child_process не используется. Плагин использует WASM, который работает на всех платформах.

---

### 🧪 14. Тестирование на нескольких платформах

> (Ревьюер может заметить неработающие фичи на непротестированной платформе)

- [ ] Если в чеклисте PR не отмечена какая-то платформа — будьте готовы, что спросят
- [ ] macOS, Windows, Linux, Android, iOS — отметьте хотя бы те, где реально тестировали
> isDesktopOnly: false — платформозависимых API нет. Уточните у автора насчёт протестированных платформ.

---

### 📖 15. README

- [x] README.md на английском языке
- [x] Описывает назначение плагина и инструкцию по использованию
- [x] Указаны зависимости, если есть
- [ ] Скриншоты (если есть) — адекватного размера
> README на английском, с секциями Installation, Quick Start, Usage, Settings, Development. Зависимости указаны.

---

### 👥 16. Transfer / смена владельца плагина

> (Редкий случай, но бывает)

- [x] Если передаёте плагин — старый автор должен подтвердить в комментариях
- [x] Новый репозиторий — форк старого, с тегом той же версии
> не актуально — передача плагина не производится.

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