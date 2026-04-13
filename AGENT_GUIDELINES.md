# AGENT_GUIDELINES.md - Руководство для агента по работе с FSRS плагином для Obsidian

## ⚠️ ВАЖНОЕ ПРЕДУПРЕЖДЕНИЕ

**НЕ ЧИТАЙТЕ файлы в директории `generated/`**:

- `generated/wasm_base64.ts` (~236KB) - содержит base64-кодированный WASM модуль
- `generated/wasm_base64.txt` (~20KB) - текстовое представление WASM

Эти файлы занимают огромное количество контекстных токенов и НЕ содержат полезной для анализа информации. Они используются только для встраивания WASM в сборку.

## 📁 Структура проекта

```
obsidian-sample-plugin/
├── src/                    # Исходный код TypeScript (ЧИТАЙТЕ ЗДЕСЬ)
│   ├── main.ts            # Основной файл плагина (точка входа)
│   ├── settings.ts        # Настройки плагина
│   └── ...                # Другие TypeScript файлы
├── wasm-lib/              # Rust код для WASM модуля
│   ├── src/lib.rs         # Основной Rust код (FSRS логика)
│   ├── Cargo.toml         # Rust зависимости
│   └── pkg/               # Скомпилированный WASM
├── generated/             # ⚠️ СГЕНЕРИРОВАННЫЕ файлы (НЕ ЧИТАТЬ!)
│   ├── wasm_base64.ts     # ⚠️ ОЧЕНЬ БОЛЬШОЙ файл (НЕ ЧИТАТЬ!)
│   └── wasm_base64.txt    # ⚠️ Текстовый WASM (НЕ ЧИТАТЬ!)
├── scripts/               # Скрипты сборки
│   └── encode-wasm.js     # Кодирует WASM в base64
├── node_modules/          # Node.js зависимости
├── package.json           # Конфигурация npm
├── manifest.json          # Конфигурация плагина Obsidian
├── esbuild.config.mjs     # Конфигурация сборки
└── ...
```

## 📄 Ключевые файлы для чтения (безопасные)

### Основной код
- `src/main.ts` - Жизненный цикл плагина, команды, логика
- `src/settings.ts` - Интерфейс настроек и UI

### Конфигурация
- `package.json` - Зависимости и скрипты сборки
- `manifest.json` - Метаданные плагина для Obsidian
- `esbuild.config.mjs` - Конфигурация сборщика

### Rust/WASM логика
- `wasm-lib/src/lib.rs` - FSRS алгоритм на Rust
- `wasm-lib/Cargo.toml` - Rust зависимости

### Скрипты
- `scripts/encode-wasm.js` - Как создаются generated файлы

## 🚫 Файлы, которые НЕЛЬЗЯ читать (опасные)

1. **`generated/wasm_base64.ts`** - Base64 строка WASM модуля (~236KB)
2. **`generated/wasm_base64.txt`** - Текстовое представление WASM (~20KB)
3. **`node_modules/`** - Зависимости (очень большая директория)
4. **`wasm-lib/target/`** - Скомпилированные Rust артефакты
5. **`main.js`** - Скомпилированный выходной файл (генерируется)

## 🔧 Рабочий процесс сборки

### Компиляция WASM
```bash
npm run build-wasm           # Компилирует Rust в WASM
npm run encode-wasm          # Конвертирует WASM в base64 (создает generated/)
```

### Разработка
```bash
npm run dev                  # Режим разработки с отслеживанием изменений
```

### Продакшен сборка
```bash
npm run build               # Финальная сборка
```

### Процесс сборки:
1. Rust код компилируется в WASM (`wasm-lib/src/lib.rs` → `wasm-lib/pkg/wasm_lib_bg.wasm`)
2. WASM кодируется в base64 (`scripts/encode-wasm.js`)
3. Base64 сохраняется в `generated/wasm_base64.ts`
4. TypeScript код компилируется в `main.js`

## 💡 Как работать с WASM без чтения generated файлов

### Понимание импортов
В `src/main.ts` используется:
```typescript
import { WASM_BASE64 } from "../generated/wasm_base64";
```

Этот импорт:
- Содержит base64 строку WASM модуля
- Используется функцией `base64ToBytes()` для декодирования
- Передается в `init()` для инициализации WASM

### Альтернативный подход
Если нужно понять логику WASM:
1. Читайте `wasm-lib/src/lib.rs` - исходный Rust код
2. Изучайте экспортируемые функции в `src/main.ts`:
   - `get_fsrs_yaml()`
   - `review_card()`
   - `get_next_review_dates()`
   - и другие (см. импорты в `src/main.ts`)

## 🛠️ Доступные инструменты и команды

### NPM скрипты:
- `npm run dev` - Разработка с hot reload
- `npm run build` - Продакшен сборка
- `npm run build-wasm` - Сборка WASM модуля
- `npm run encode-wasm` - Кодирование WASM в base64
- `npm run lint` - Проверка кода ESLint

### Полезные команды:
```bash
# Проверить размер файлов
du -h generated/wasm_base64.ts
du -h generated/wasm_base64.txt

# Проверить структуру
find . -name "*.ts" -o -name "*.rs" -o -name "*.json" | grep -v node_modules | grep -v generated

# Поиск в коде (безопасный)
grep -r "WASM_BASE64" --include="*.ts" --exclude-dir=generated --exclude-dir=node_modules
```

## 📊 Понимание FSRS плагина

### Основные функции:
1. **Добавление полей FSRS** - Вставляет YAML frontmatter с данными карточки
2. **Поиск карточек для повторения** - Находит файлы с просроченными датами
3. **Повторение карточки** - Обновляет карточку на основе оценки пользователя

### Структура данных:
```yaml
fsrs_due: "2024-01-01T00:00:00Z"
fsrs_stability: 0.0
fsrs_difficulty: 0.0
fsrs_elapsed_days: 0
fsrs_scheduled_days: 0
fsrs_reps: 0
fsrs_lapses: 0
fsrs_state: "New"
fsrs_last_review: "2024-01-01T00:00:00Z"
```

## 🚨 Типичные проблемы и решения

### Проблема: "Агент тратит все токены на чтение wasm_base64.ts"
**Решение**: Никогда не вызывайте `read_file` на файлах в `generated/`. Вместо этого:
- Читайте `wasm-lib/src/lib.rs` для логики FSRS
- Читайте `src/main.ts` для TypeScript кода
- Используйте `grep` для поиска функций

### Проблема: "Не понимаю, как работает WASM"
**Решение**: 
1. Изучите Rust код в `wasm-lib/src/lib.rs`
2. Посмотрите, как функции вызываются в `src/main.ts`
3. Проверьте `package.json` для понимания процесса сборки

### Проблема: "Нужно изменить процесс сборки"
**Решение**:
1. Измените `scripts/encode-wasm.js` для генерации файлов
2. Обновите `esbuild.config.mjs` для конфигурации сборки
3. Проверьте `package.json` скрипты

## 📝 Рекомендации по редактированию

1. **Всегда сначала проверяйте размер файла** перед чтением
2. **Используйте `grep`** для поиска в коде вместо чтения всех файлов
3. **Сфокусируйтесь на `src/` и `wasm-lib/src/`** для логики
4. **Избегайте `generated/`, `node_modules/`, `wasm-lib/target/`**
5. **Тестируйте изменения** с помощью `npm run build` перед сохранением

## 🔄 Обновление файла

Если вам нужно изменить процесс сборки или добавить новые инструкции, обновите этот файл и добавьте соответствующие изменения в:
- `scripts/encode-wasm.js` для генерации WASM
- `package.json` для новых скриптов
- `src/main.ts` для изменений в логике

---
*Последнее обновление: Для безопасной работы с FSRS плагином Obsidian*
*Цель: Предотвратить расход токенов на чтение больших generated файлов*