# Релизная проверка FSRS Plugin — v0.4.6

Дата проверки: 2026

## 1. Обязательные файлы

| Файл | Статус |
|------|--------|
| `manifest.json` | ✅ есть |
| `main.js` | ✅ собран |
| `styles.css` | ✅ есть |
| `LICENSE` | ✅ LGPL-3.0 |

## 2. manifest.json — проверка полей

| Поле | Значение | Статус |
|------|----------|--------|
| `id` | `fsrs-plugin` | ✅ |
| `name` | `FSRS Plugin` | ✅ |
| `version` | `0.4.6` | ✅ |
| `minAppVersion` | `0.1.0` | ⚠️ **занижена** — README обещает v0.15.0+ |
| `description` | Есть | ✅ |
| `author` | `Evgene Kopylov` | ✅ |
| `isDesktopOnly` | `false` | ✅ (поддержка мобильных) |

## 3. Версии в документации

| Файл | Текущее значение | Нужное значение | Статус |
|------|------------------|-----------------|--------|
| `README.md` | `0.4.5` | `0.4.6` | ❌ устарело |
| `README.ru.md` | `0.4.5` | `0.4.6` | ❌ устарело |
| `docs/intended_use.md` | `0.4.5` | `0.4.6` | ❌ устарело |
| `docs/intended_use.ru.md` | `0.4.5` | `0.4.6` | ❌ устарело |

## 4. versions.json

| Проверка | Статус |
|----------|--------|
| Есть запись для 0.4.6 | ❌ **отсутствует** — есть только `"0.1.1": "0.1.0"` |

Нужно добавить: `"0.4.6": "<minAppVersion>"`

## 5. Языковой переключатель (language switcher)

| Файл | Ссылка | Должно быть | Статус |
|------|--------|-------------|--------|
| `docs/intended_use.md` | `[🇷🇺](README.ru.md)` | `[🇷🇺](intended_use.ru.md)` | ❌ неверный путь |
| `docs/intended_use.ru.md` | `[🇺🇸](README.md)` | `[🇺🇸](intended_use.md)` | ❌ неверный путь |

## 6. Соответствие Plugin guidelines

### ✅ Выполнено

- `setHeading()` используется вместо `<h1>`/`<h2>` ✅
- `innerHTML` / `outerHTML` / `insertAdjacentHTML` не используются ✅
- Нет умолчательных хоткеев для команд ✅
- `var` не используется, только `const`/`let` ✅
- `workspace.activeLeaf` не используется ✅
- Глобальный `app` / `window.app` не используется ✅
- `getFiles().find()` не используется ✅
- Ресурсы регистрируются через `register*` (registerEvent, addCommand) ✅
- `Vault.getFileByPath` используется вместо итерации всех файлов ✅
- async/await вместо Promise chains ✅

### ⚠️ Рекомендации (не блокирующие)

**Vault.modify → Vault.process**

Plugin guidelines рекомендуют `Vault.process` вместо `Vault.modify` для атомарных изменений. Затронутые файлы:

| Файл | Строка |
|------|--------|
| `src/commands/add-fsrs-fields.ts` | `app.vault.modify(activeFile, newContent)` |
| `src/commands/add-review-button.ts` | `app.vault.modify(activeFile, newContent)` |
| `src/commands/find-fsrs-cards.ts` | `plugin.app.vault.modify(activeFile, newContent)` |
| `src/commands/review/review-card.ts` | `app.vault.modify(file, newContent)` |
| `src/commands/review/delete-last-review.ts` | `app.vault.modify(file, newContent)` |

### ❌ Не найдено нарушений

- `console.log` без необходимости — нет, используется `console.debug` и `verboseLog` с флагом ✅
- `Vault.modify` для активного редактора — активные файлы не редактируются через modify (кроме случаев вставки полей, где Editor API не применим) ✅

## 7. Соответствие Developer policies

| Политика | Статус |
|----------|--------|
| Нет обфускации кода | ✅ |
| Нет динамической рекламы | ✅ |
| Нет статической рекламы | ✅ |
| Нет клиентской телеметрии | ✅ |
| Нет механизмов автообновления | ✅ |
| Работает локально/офлайн | ✅ — WASM встроен в main.js через base64 |
| Нет внешних сетевых запросов | ✅ |
| Не требует аккаунт/оплату | ✅ |
| Не обращается к файлам вне хранилища | ✅ |
| Лицензия совместима | ✅ LGPL-3.0 |

## 8. Чеклист сообщества (community plugins checklist)

| Пункт | Статус |
|-------|--------|
| Протестировано на Linux | ✅ |
| Протестировано на Windows | ❓ |
| Протестировано на macOS | ❓ |
| Протестировано на Android | ❓ |
| Протестировано на iOS | ❓ |
| GitHub release содержит main.js, manifest.json | ✅ |
| GitHub release содержит styles.css | ✅ |
| Версия релиза совпадает с manifest.json | ❓ (проверить перед созданием тега) |
| id в manifest.json совпадает с community-plugins.json | ✅ (`fsrs-plugin`) |
| README.md описывает назначение и инструкции | ✅ |
| Developer policies прочитаны и соблюдены | ❓ |
| Plugin guidelines прочитаны, код проверен | ❓ |
| LICENSE файл присутствует | ✅ |
| Совместимость с лицензиями стороннего кода | ✅ (нет сторонних зависимостей с конфликтующими лицензиями) |

## 9. Итого к исправлению перед релизом

1. **`manifest.json`** — поднять `minAppVersion` до `0.15.0` (или актуальной версии)
2. **`versions.json`** — добавить `"0.4.6": "0.15.0"`
3. **`README.md`** — исправить версию `0.4.5` → `0.4.6`
4. **`README.ru.md`** — исправить версию `0.4.5` → `0.4.6`
5. **`docs/intended_use.md`** — исправить версию и ссылку language switcher
6. **`docs/intended_use.ru.md`** — исправить версию и ссылку language switcher
7. **Опционально:** заменить `Vault.modify` на `Vault.process` в 5 файлах