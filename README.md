# FSRS Plugin для Obsidian

**Free Spaced Repetition Scheduler** — современный алгоритм интервального повторения в Obsidian. Плагин превращает заметки в карточки для запоминания по FSRS.

[![Obsidian](https://img.shields.io/badge/Obsidian-%23483699.svg?style=for-the-badge&logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=TypeScript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-000000.svg?style=for-the-badge&logo=Rust&logoColor=white)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-LGPLv3-blue.svg?style=for-the-badge)](LICENSE)
[![GitLab CI](https://img.shields.io/gitlab/pipeline-status/Evgene-Kopylov/FSRS-plugin?branch=main&style=for-the-badge)](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/pipelines)

---

Репозиторий на GitHub только зеркало, разработка ведется на GitLab: [gitlab.com/Evgene-Kopylov/FSRS-plugin](https://gitlab.com/Evgene-Kopylov/FSRS-plugin)
---

## 📋 Содержание

[toc]

## 🚀 Особенности

- **📊 Алгоритм FSRS** — эффективнее SM-2
- **🎯 Контроль запоминания** — уровень 70-97%
- **⚡ Высокая производительность** — Rust/WASM для быстрых вычислений
- **🔄 Динамический интерфейс** — автообновление списков
- **📱 Поддержка мобильных** — iOS, Android
- **🎨 Гибкая настройка** — фильтрация, сортировка, кастомизация
- **📈 Статистика** — отслеживание прогресса

## 📦 Установка

### Через Obsidian Community Plugins (рекомендуется)

1. Откройте **Настройки** → **Community plugins** → **Browse**
2. Найдите "FSRS Plugin"
3. Нажмите **Install**, затем **Enable**

### Через BRAT (для тестирования бета-версий)

1. Установите плагин [BRAT](https://github.com/TfTHacker/obsidian42-brat) в Obsidian
2. Откройте **Настройки** → **Community plugins** → **BRAT**
3. Добавьте репозиторий: `https://github.com/Evgene-Kopylov/fsrs_plugin`
4. Включите плагин в **Настройки** → **Community plugins**

### Требования

- Obsidian v0.15.0 или выше
- Поддержка WebAssembly (по умолчанию включена)

## 🏃 Быстрый старт

1. **Включите плагин** в настройках Obsidian
2. **Создайте карточку**:
   - Откройте заметку → команда `Добавить поля FSRS в шапку файла` (Ctrl/Cmd+P)
3. **Добавьте блок повторений** в нужный файл:

   ````markdown
   ```fsrs-table
   SELECT file as " ", retrievability as "R", stability as "S", difficulty as "D", overdue as "oDue."
   LIMIT 20
   ```
   ````

4. **Начните повторять** — откройте файл с блоком, кликайте карточки

## 📖 Использование

### Блок `fsrs-table` (SQL-подобный синтаксис)

Блок `fsrs-table` использует SQL-подобный синтаксис для настройки отображения карточек.

**Базовый синтаксис:**

````markdown
```fsrs-table
SELECT поле1, поле2 as "Заголовок", поле3
ORDER BY поле4 DESC
LIMIT 30
```
````

**Доступные поля (columns):**

| Поле | Описание | Примечания |
|------|----------|------------|
| `file` | имя файла карточки | кликабельная ссылка |
| `reps` | количество выполненных повторений | |
| `overdue` | часов просрочки | |
| `stability` | стабильность карточки (S) | параметр FSRS |
| `difficulty` | сложность карточки (D) | значение от 0 до 10 |
| `retrievability` | извлекаемость (R) | вероятность правильного ответа |
| `due` | дата и время следующего повторения | |
| `state` | состояние карточки | New, Learning, Review, Relearning |
| `elapsed` | дней с последнего повторения | |
| `scheduled` | дней до следующего повторения | |

**Параметры блока:**

- `SELECT` — выбор полей для отображения (обязательный)
- `ORDER BY` — сортировка по указанному полю (ASC - по возрастанию, DESC - по убыванию)
- `LIMIT` — ограничение количества строк (0 = используется значение из настроек плагина)

**Примеры:**

1. Просроченные карточки с приоритетом:

````markdown
```fsrs-table
SELECT file as " ", retrievability as "R", stability as "S", difficulty as "D", overdue as "Проср."
LIMIT 20
```
````

1. Все карточки с сортировкой по дате:

````markdown
```fsrs-table
SELECT *
ORDER BY due ASC
LIMIT 100
```
````

### Кнопка повнорения в теле заметки `fsrs-review-button`

````markdown
```fsrs-review-button
```
````

### Формат карточек FSRS

Карточки FSRS хранятся в frontmatter заметки. Поле `reviews`:

```yaml
---
reviews:
  - date: "2025-01-15T10:30:00Z"
    rating: "Good"
    stability: 5.21
    difficulty: 0.45
  - date: "2025-01-20T14:15:00Z"
    rating: "Easy"
    stability: 12.5
    difficulty: 0.35
---
```

**Поля каждой сессии:**

- **`date`** — дата/время в ISO 8601
- **`rating`** — `"Again"`, `"Hard"`, `"Good"` или `"Easy"`
- **`stability`** — S, стабильность (дни)
- **`difficulty`** — D, сложность (0.0–1.0)

**Особенности:**

- `reviews` может быть `[]` для новых карточек
- Каждое повторение добавляет сессию в массив
- FSRS вычисляет следующую дату на основе истории
- Плагин добавляет поля автоматически

## 🎮 Команды плагина

### Через палитру (Ctrl/Cmd+P)

- **FSRS Plugin: Добавить поля FSRS в шапку файла**
- **FSRS Plugin: Найти карточки для повторения**
- **FSRS Plugin: Повторить текущую карточку**
- **FSRS Plugin: Удалить последнее повторение карточки**
- **FSRS Plugin: Показать историю повторений**
- **FSRS Plugin: Показать справку по синтаксису fsrs-table**

### Через Obsidian Status bar

- Кнопка `🔄FSRS:` внизу экрана

## ⚙️ Настройки

### Параметры алгоритма FSRS

| Настройка | Описание | По умолчанию |
|-----------|----------|--------------|
| **Request Retention** | Целевой уровень запоминания (0.5-1.0) | 0.92 (92%) |
| **Maximum Interval** | Макс. интервал (дни) | 36500 (~100 лет) |
| **Enable Interval Fuzz** | Случайное изменение интервалов (±5%) | Включено |

### Настройки по умолчанию для новых карточек

| Настройка | Описание | По умолчанию |
|-----------|----------|--------------|
| **Initial Stability** | Начальная стабильность для новых карточек | 0.0 |
| **Initial Difficulty** | Начальная сложность для новых карточек | 0.0 |

### Настройки отображения

| Настройка | Описание | По умолчанию |
|-----------|----------|--------------|
| **Auto Add Review Button** | Автоматическое добавление кнопки повторения | Выключено |

### Настройки досрочного повторения

| Настройка | Описание | По умолчанию |
|-----------|----------|--------------|
| **Minimum Early Review Interval** | Минимальные минуты до досрочного повторения | 40 |

### Настройки фильтрации

| Настройка | Описание | Пример |
|-----------|----------|--------|
| **Ignore Patterns** | Паттерны для игнорирования файлов/папок | `.obsidian/`, `templates/`, `*.excalidraw.md` |

## 🧠 Алгоритм FSRS

**FSRS** — современный алгоритм интервального повторения от Jarrett Ye. Отличие от SM-2:

- Изучает паттерны памяти через ML
- Адаптируется под скорость запоминания
- Требует на 20-30% меньше повторений для того же уровня запоминания
- Лучше обрабатывает перерывы (недели/месяцы)

### Ключевые концепции

- **Retrievability (R)** — вероятность успешного вспоминания
- **Stability (S)** — время, за которое R падает с 100% до 90%
- **Difficulty (D)** — сложность информации (влияет на рост стабильности)

Алгоритм использует 21 параметр, оптимизированный на миллионах повторений.

**Подробнее:** [ABC of FSRS](docs/ABC%20of%20FSRS.md)

## 🛠️ Разработка

**Разработка ведётся на GitLab:** [gitlab.com/Evgene-Kopylov/FSRS-plugin](https://gitlab.com/Evgene-Kopylov/FSRS-plugin). Репозиторий на GitHub является зеркалом.

### Технический стек

- **Frontend:** TypeScript, Obsidian API
- **Алгоритм:** Rust (компилируется в WebAssembly)
- **Сборка:** esbuild, wasm-pack
- **Тестирование:** Rust (cargo test) + TypeScript (vitest)

## Разграничение ответственности Rust и TypeScript

**Принцип:** Rust — вычислительное ядро, TypeScript — тонкая обвязка для API Obsidian.

### Пайплайн релиза

Проект использует GitLab CI/CD для автоматической сборки, тестирования и релиза:

[![GitLab CI](https://img.shields.io/gitlab/pipeline-status/Evgene-Kopylov/FSRS-plugin?branch=main&style=for-the-badge)](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/pipelines)

### Сборка из исходников

```bash
# Клонирование репозитория
git clone https://gitlab.com/Evgene-Kopylov/FSRS-plugin.git
cd FSRS-plugin

# Установка зависимостей
npm install

# Сборка WASM модуля
npm run build-wasm

# Разработка (watch mode)
npm run dev

# Продакшн сборка
npm run build
```

### WASM интеграция

Плагин использует Rust/WASM для вычислений FSRS:

- **Бинарник WASM** встраивается в плагин через base64
- **Нет сетевых запросов** — всё локально
- **Высокая производительность** — нативные вычисления

**Подробнее:** [WASM Integration](docs/WASM-INTEGRATION.md)

## 📄 Лицензия

Плагин под **LGPLv3**.

**LGPL** разрешает:

- Использование в проприетарном ПО
- Требует открытия исходного кода модифицированной библиотеки

### Основные права

- ✅ Использовать (бесплатно, включая коммерцию)
- ✅ Изучать (доступ к исходникам)
- ✅ Распространять
- ✅ Совершенствовать

### Условия

- Модификации библиотеки — под LGPLv3
- Динамическое связывание разрешено без открытия кода приложения
- Сохранять уведомления об авторских правах
- При распространении модификаций — предоставить исходный код

### Для пользователей Obsidian

- Свободно использовать в личных/коммерческих целях
- Производные плагины — под LGPLv3
- Модификации WASM-компонентов на Rust — под LGPLv3

Полный текст: [LICENSE](LICENSE)

## 🙏 Благодарности

- **Jarrett Ye** — создатель FSRS
- **Сообщество Obsidian** — вдохновение и поддержка
- **Сообщество Rust** — инструменты WASM
- **Все контрибьюторы** — улучшения и баг-репорты

## 📚 Дополнительные ресурсы

- [Официальная документация FSRS](https://github.com/open-spaced-repetition/fsrs)
- [Обсуждение на форуме Obsidian](https://forum.obsidian.md/)
- [Issues и feature requests](https://gitlab.com/Evgene-Kopylov/FSRS-plugin/-/work_items)
- [Руководство по использованию fsrs-table](docs/ABC%20of%20FSRS.md)

---

**Примечание:** Плагин в активной разработке. Функциональность может не значительно меняться.

*Последнее обновление: 2026*
*Версия плагина: 0.1.3*
