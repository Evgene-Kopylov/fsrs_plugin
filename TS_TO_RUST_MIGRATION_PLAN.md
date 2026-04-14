# План переноса TypeScript логики в Rust для плагина FSRS

## Обоснование переноса

Текущая архитектура плагина страдает от сложности тестирования TypeScript-кода, который зависит от окружения Obsidian API. Перенос бизнес-логики в Rust (WASM) предоставит следующие преимущества:

- **Тестируемость**: Rust unit-тесты изолированы, работают без зависимостей от Obsidian
- **Надёжность**: Использование проверенных библиотек (`serde_yaml`, `rs-fsrs`) вместо самописных парсеров
- **Производительность**: Уменьшение межслойных вызовов между TypeScript и WASM
- **Сопровождаемость**: Бизнес-логика сосредоточена в одном месте с строгой типизацией
- **Безопасность**: Rust обеспечивает memory safety и предотвращает целый класс ошибок

## Текущая архитектура

### TypeScript модули (подлежат рефакторингу)
```
src/utils/fsrs/
├── fsrs-parser.ts          # Парсинг YAML frontmatter (самописный парсер)
├── fsrs-sort.ts            # Фильтрация, сортировка, приоритизация карточек
├── fsrs-time.ts            # Вспомогательные вычисления времени
└── fsrs-wasm.ts            # Обёртки над WASM функциями
```

### Rust/WASM модули (будут расширены)
```
wasm-lib/src/
├── lib.rs                  # Экспорт WASM функций
├── types.rs                # Структуры данных
├── json_parsing.rs         # Работа с JSON
├── fsrs_logic.rs           # Алгоритмы FSRS (через rs-fsrs)
├── review_functions.rs     # Функции повторения карточек
└── state_functions.rs      # Вычисление состояний
```

## Функции для переноса в Rust

### 1. Парсинг YAML (высший приоритет)

| TypeScript функция | Rust аналог | Описание |
|-------------------|-------------|----------|
| `parseYaml()` | Использовать `serde_yaml::from_str()` | Замена самописного парсера на промышленное решение |
| `parseYamlValue()` | Встроенная десериализация `serde_yaml` | Больше не нужна |
| `parseModernFsrsFromFrontmatter()` | `parse_fsrs_frontmatter()` | Парсинг frontmatter с валидацией структуры |

**Новая WASM функция:**
```rust
#[wasm_bindgen]
pub fn parse_fsrs_frontmatter(frontmatter: String) -> String {
    // Возвращает JSON: {success: bool, card: ModernFsrsCard, error: string?}
}
```

### 2. Фильтрация и сортировка карточек

| TypeScript функция | Rust аналог | Преимущества переноса |
|-------------------|-------------|-----------------------|
| `filterCardsForReview()` | `filter_cards_for_review()` | Пачковое вычисление состояний, меньше вызовов WASM |
| `sortCardsByPriority()` | `sort_cards_by_priority()` | Единая логика сортировки, тестируемая изоляция |
| `calculateCardPriorityScore()` | Внутренняя функция | Упрощение API |
| `groupCardsByState()` | `group_cards_by_state()` | Оптимизация вычислений |

**Новые WASM функции:**
```rust
#[wasm_bindgen]
pub fn filter_cards_for_review(
    cards_json: String,      // JSON массив карточек
    settings_json: String,   // Параметры FSRS
    now_iso: String          // Текущее время ISO
) -> String;                // JSON отфильтрованного массива

#[wasm_bindgen]
pub fn sort_cards_by_priority(...) -> String;  // Аналогично
```

### 3. Вычисления времени

| TypeScript функция | Rust аналог | Примечания |
|-------------------|-------------|------------|
| `getOverdueHours()` | `get_overdue_hours()` | Чистая функция, легко тестируется |
| `getHoursUntilDue()` | `get_hours_until_due()` | Чистая функция |
| `isCardOverdue()` | `is_card_overdue()` | Чистая функция |
| `getCardAgeInDays()` | `get_card_age_days()` | Чистая функция |
| Форматирующие функции | Оставить в TypeScript | Логика локализации/UI |

**Новые WASM функции:**
```rust
#[wasm_bindgen]
pub fn get_overdue_hours(due_iso: String, now_iso: String) -> f64;
#[wasm_bindgen]
pub fn is_card_overdue(due_iso: String, now_iso: String) -> bool;
```

## Что останется в TypeScript

1. **Интеграция с Obsidian API**
   - Чтение/запись файлов
   - Регистрация команд плагина
   - Работа с настройками
   - Plugin lifecycle (`onload`, `onunload`)

2. **Пользовательский интерфейс**
   - Генерация HTML (`fsrs-html.ts`)
   - Обработка событий DOM
   - Рендеринг блоков `fsrs-now`

3. **Форматирование и локализация**
   - `formatOverdueTime()` – склонение русских существительных
   - `formatTimeUntilDue()` – форматирование для пользователя
   - `describeCardState()` – текстовые описания состояний

4. **Тонкие обёртки над WASM**
   - Упрощённые адаптеры для новых функций
   - Обработка ошибок на уровне TS
   - Преобразование типов данных

## Поэтапный план реализации

### Этап 1: Подготовка инфраструктуры (1-2 дня)
1. Настройка среды разработки Rust (если не готово)
2. Создание тестовой структуры для новых WASM функций
3. Добавление недостающих зависимостей (`serde_yaml` уже есть)

### Этап 2: Парсинг YAML (2-3 дня)
1. Реализация `parse_fsrs_frontmatter()` в Rust с тестами
2. Интеграция в TypeScript: замена `parseModernFsrsFromFrontmatter`
3. Тестирование на реальных файлах из TestCards
4. Удаление старого кода: `fsrs-parser.ts`

### Этап 3: Фильтрация и сортировка (3-4 дня)
1. Реализация `filter_cards_for_review()` с внутренним вызовом `compute_current_state`
2. Реализация `sort_cards_by_priority()` с вычислением приоритета
3. Реализация `group_cards_by_state()` для UI-группировки
4. Интеграция в TypeScript с сохранением существующего API
5. Удаление `fsrs-sort.ts`

### Этап 4: Вычисления времени (1-2 дня)
1. Реализация простых функций даты/времени
2. Интеграция с минимальными изменениями TypeScript
3. Рефакторинг `fsrs-time.ts` – оставить только форматирование

### Этап 5: Рефакторинг и тестирование (2-3 дня)
1. Удаление дублирующей логики из TypeScript
2. Написание комплексных интеграционных тестов
3. Тестирование производительности
4. Обновление документации

## API изменения

### Новые WASM функции (добавить в `lib.rs`):
```rust
// Парсинг
pub fn parse_fsrs_frontmatter(frontmatter: String) -> String;

// Фильтрация и сортировка
pub fn filter_cards_for_review(cards_json: String, settings_json: String, now_iso: String) -> String;
pub fn sort_cards_by_priority(cards_json: String, settings_json: String, now_iso: String) -> String;
pub fn group_cards_by_state(cards_json: String, settings_json: String, now_iso: String) -> String;

// Вычисления времени
pub fn get_overdue_hours(due_iso: String, now_iso: String) -> f64;
pub fn get_hours_until_due(due_iso: String, now_iso: String) -> f64;
pub fn is_card_overdue(due_iso: String, now_iso: String) -> bool;
pub fn get_card_age_days(card_json: String, now_iso: String) -> f64;
```

### Изменения в TypeScript:

**Новый модуль `fsrs-rust.ts`:**
```typescript
// Упрощённые обёртки над новыми функциями
export async function parseFrontmatter(frontmatter: string): Promise<ParseResult>;
export async function filterCards(cards: ModernFSRSCard[], settings: FSRSSettings): Promise<ModernFSRSCard[]>;
export async function sortCards(cards: ModernFSRSCard[], settings: FSRSSettings): Promise<ModernFSRSCard[]>;
```

**Удаляемые модули:**
- `fsrs-parser.ts` – полностью заменяется
- `fsrs-sort.ts` – полностью заменяется
- `fsrs-time.ts` – остаётся только форматирование
- Упрощение `fsrs-wasm.ts` – остаются только базовые обёртки

## Стратегия тестирования

### Rust unit-тесты:
```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_parse_frontmatter_valid() {
        // Тесты парсинга различных форматов YAML
    }
    
    #[test]
    fn test_filter_cards_logic() {
        // Тесты фильтрации с разными состояниями карточек
    }
    
    #[test]
    fn test_sort_priority() {
        // Тесты приоритизации (просроченные > низкая retrievability)
    }
}
```

### Интеграционные тесты:
1. **Сквозные тесты парсинга** – реальные файлы из TestCards
2. **Тесты производительности** – сравнение времени выполнения до/после
3. **Тесты совместимости** – проверка обратной совместимости формата

### TypeScript тесты (оставить):
- Тесты форматирования (русская локализация)
- Тесты интеграции с Obsidian API (если есть)
- E2E тесты UI (блоки `fsrs-now`)

## Риски и способы их mitigation

| Риск | Вероятность | Влияние | Mitigation |
|------|------------|---------|------------|
| Ошибки совместимости формата YAML | Средняя | Высокое | Постепенный переход, сохранение старого парсера как fallback |
| Ухудшение производительности из-за сериализации | Низкая | Среднее | Профилирование, оптимизация batch-обработки |
| Сложность отладки WASM | Средняя | Среднее | Подробное логирование, тесты на граничные случаи |
| Поломка существующей функциональности | Средняя | Высокое | Поэтапный rollout, тестирование на реальных данных |

## Критерии успеха

1. **Функциональность**: Все существующие команды плагина работают без изменений
2. **Производительность**: Время обработки карточек не увеличивается
3. **Надёжность**: Парсинг YAML обрабатывает все корректные форматы из TestCards
4. **Тестируемость**: Критическая бизнес-логика покрыта unit-тестами в Rust
5. **Сопровождаемость**: Упрощение TypeScript кода на 40-50%

## Ориентировочная оценка времени

- **Общее время**: 1.5-2 недели разработки
- **Фаза 1-2**: 3-5 дней (парсинг YAML)
- **Фаза 3**: 4-5 дней (фильтрация и сортировка)
- **Фаза 4-5**: 3-4 дня (доводка и тестирование)

## Следующие шаги

1. **Начать с Этапа 1** – подготовка инфраструктуры
2. **Создать первый PR** с парсингом YAML на Rust
3. **Постепенная интеграция** – каждый этап в отдельном PR
4. **Непрерывное тестирование** – запускать тесты после каждого изменения

---

*Документ составлен на основе анализа кодовой базы от 2025-...*
*Последнее обновление: ...*