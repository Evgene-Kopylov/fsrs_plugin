# Анализ накопленных кривизн в коде FSRS плагина

## Введение

В результате нескольких итераций разработки в кодовой базе FSRS плагина накопились различные кривизны:
- Устаревшие методы, сохраняемые для обратной совместимости
- Функции-заглушки, которые не выполняют реальной работы
- Дублирующаяся функциональность
- Неиспользуемый или устаревший код
- Непоследовательные интерфейсы и типизация

Этот анализ выявляет такие места и предлагает пути их устранения.

## 1. Устаревшие методы с пометкой @deprecated

### 1.1 Команды плагина

**Проблема**: Сохранение старых методов для обратной совместимости усложняет код

**Примеры**:

```typescript
// src/commands/review-current-card.ts
/**
 * @deprecated Используйте модуль `./review` для новых импортов
 * Файл сохранен для обратной совместимости
 */
export { ReviewModal } from "./review/review-modal";
export {
    reviewCurrentCard,
    reviewCurrentCardSimple,
} from "./review/review-card";
```

```typescript
// src/commands/review/review-card.ts
/**
 * Упрощенная версия для обратной совместимости (использует фиксированную оценку Good)
 * @deprecated Используйте reviewCurrentCard с выбором оценки
 */
export async function reviewCurrentCardSimple(app: App): Promise<void> {
    // Устаревшая логика с фиксированной оценкой Good
}
```

**Последствия**:
- Дублирование кода между старыми и новыми методами
- Путаница при выборе правильного метода для использования
- Увеличение размера бандла неиспользуемым кодом

### 1.2 Функции фильтрации карточек

**Проблема**: Множество функций-заглушек с пометкой @deprecated

**Примеры в `src/utils/fsrs-table-filter.ts`**:

```typescript
/**
 * Получает значение поля для сортировки (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function getFieldValue(
    item: CardWithState,
    field: string,
    now: Date,
): string | number | Date {
    console.warn(`Функция getFieldValue устарела...`);
    return ""; // Фактически не используется
}

/**
 * Сортирует due карточки по приоритету (заглушка для совместимости)
 * @deprecated Используется только для обратной совместимости
 */
export function sortCardsForDue(
    cards: CardWithState[],
    now: Date,
): CardWithState[] {
    console.warn(`Функция sortCardsForDue устарела...`);
    return cards; // Ничего не делает
}
```

**Всего 7 функций-заглушек в одном файле**:
1. `getFieldValue()` - возвращает пустые значения
2. `sortCardsForDue()` - возвращает исходный массив
3. `sortScheduledCards()` - возвращает исходный массив
4. `calculatePriorityScore()` - всегда возвращает 0
5. `computeCardsStates()` - возвращает пустой массив
6. `applyDefaultSort()` - возвращает исходный массив
7. `applyCustomSort()` - возвращает исходный массив

**Последствия**:
- Функции не выполняют реальной работы, только предупреждают в консоли
- Загромождают API модуля
- Вводят в заблуждение разработчиков

## 2. Дублирование функциональности

### 2.1 Две функции фильтрации с похожей сигнатурой

**Проблема**: Две функции делают почти одно и то же, но с разными параметрами

```typescript
// src/utils/fsrs-table-filter.ts
export async function filterAndSortCardsWithSql(
    cards: ModernFSRSCard[],
    settings: FSRSSettings,
    sqlSource: string,  // SQL запрос
    now: Date = new Date(),
): Promise<CardWithState[]>

export async function filterAndSortCards(
    cards: ModernFSRSCard[],
    settings: FSRSSettings,
    params: TableParams,  // Параметры таблицы
    now: Date = new Date(),
): Promise<CardWithState[]>
```

**Анализ**:
- `filterAndSortCardsWithSql` принимает SQL строку
- `filterAndSortCards` принимает структурированные параметры TableParams
- Обе вызывают WASM, но с разными параметрами
- Неясно, какая функция когда должна использоваться

### 2.2 Дублирование импортов и реэкспортов

**Проблема**: Множественные точки входа и индексы

```typescript
// src/utils/fsrs-helper.ts - простой реэкспорт
export * from "./fsrs/index";

// src/utils/fsrs/index.ts - реэкспорт из подмодулей
export * from "./fsrs-parser";
export * from "./fsrs-wasm";
// ... и т.д.

// src/utils/fsrs/fsrs-wasm.ts - реэкспорт из WASM модулей
export * from "./wasm-core";
export * from "./wasm-state";
// ... и т.д.
```

**Последствия**:
- Сложно отследить реальный источник функции
- Возможны циклические зависимости
- Усложняется рефакторинг

## 3. Неиспользуемый код

### 3.1 Интерфейс LegacyFSRSCard

**Проблема**: Интерфейс определен, но не используется в новой архитектуре

```typescript
// src/interfaces/fsrs.ts
export interface LegacyFSRSCard {
    due: string;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    state: FSRSState;
    last_review: string;
    filePath: string;
}
```

**Анализ**:
- В новом формате используется `ModernFSRSCard` с полем `reviews: ReviewSession[]`
- Проверка старого формата есть только в одном месте (`reviewCurrentCardSimple`)
- Интерфейс не экспортируется из публичного API

### 3.2 Функция filterAndSortCardsWithSql

**Проблема**: Функция определена, но не используется

**Поиск ссылок**:
```bash
grep -r "filterAndSortCardsWithSql" src/  # Результат: только определение
```

**Вывод**: Функция существует, но нигде не вызывается.

## 4. Непоследовательные интерфейсы и типизация

### 4.1 Множественные "as any" и "as unknown"

**Проблема**: Слабая типизация в критических местах

**Примеры**:

```typescript
// src/utils/date-format.ts (6 мест)
const dateFormat = ((app.vault as any).getConfig("dateFormat") as string)

// src/utils/fsrs-table-filter.ts (4 места)
const wasmResult: WasmFilterResult = JSON.parse(resultJson) as unknown as WasmFilterResult;
const card: ModernFSRSCard = JSON.parse(wasmCard.card_json) as unknown as ModernFSRSCard;

// src/ui/fsrs-help-modal.ts
null as any,  // Для MarkdownRenderer.render
```

**Последствия**:
- Потеря безопасности типов
- Возможность runtime ошибок
- Усложнение рефакторинга

### 4.2 Несогласованные сигнатуры функций

**Проблема**: Похожие функции принимают параметры в разном порядке

```typescript
// В разных модулях разные подходы:
function formatDate(date: Date, app?: App): string  // app опциональный
function formatLocalDate(date: Date, app?: App): string  // app опциональный
function parseFormattedDate(dateStr: string, app: App): Date | null  // app обязательный
```

## 5. Загроможденные модули

### 5.1 fsrs-table-filter.ts - 489 строк

**Проблема**: Один файл содержит:
- Интерфейсы (`CardWithState`, `WasmComputedFields`, `WasmCardResult`, `WasmFilterResult`)
- Две основные функции фильтрации (`filterAndSortCardsWithSql`, `filterAndSortCards`)
- 7 функций-заглушек с @deprecated
- Вспомогательные функции (`convertWasmFieldsToComputedState`, `isCardDue`)

**Последствия**:
- Сложно навигация по файлу
- Нарушение принципа единой ответственности
- Сложность тестирования отдельных компонентов

### 5.2 Множественные console.warn и console.info

**Проблема**: Отладочный вывод остался в продакшен коде

```typescript
// src/utils/fsrs-table-params.ts
// FIXME: убрать перд официальным релизом в Обсидиан
// eslint-disable-next-line no-console
console.info("WASM parse result JSON:", resultJson);

// eslint-disable-next-line no-console
console.info("Parsed WASM result:", parsedResult);

// src/utils/fsrs-table-filter.ts
console.warn(`Функция getFieldValue устарела...`);
```

## 6. Проблемы архитектуры

### 6.1 Смешение WASM и TypeScript логики

**Проблема**: Нет четкого разделения между:
- TypeScript интерфейсами и бизнес-логикой
- WASM вычислениями
- UI компонентами

**Пример**: Функции в `wasm-*.ts` модулях возвращают дефолтные значения при ошибках вместо правильной обработки.

### 6.2 Отсутствие четких слоев

**Проблема**: Команды плагина напрямую работают с:
- Файловой системой (app.vault.read/write)
- UI (Notice, модальные окна)
- Бизнес-логикой (WASM вычисления)
- Состоянием плагина

## Рекомендации по устранению

### Этап 1: Удаление явно неиспользуемого кода (Низкий риск)

1. **Удалить функции-заглушки** в `fsrs-table-filter.ts`:
   - Все 7 функций с `@deprecated` и `console.warn`
   - Они не выполняют реальной работы

2. **Удалить `review-current-card.ts`**:
   - Проверить, что нет импортов из этого файла
   - Обновить документацию, если нужно

3. **Удалить `filterAndSortCardsWithSql`**:
   - Не используется в кодовой базе
   - SQL-подобный синтаксис можно реализовать через `TableParams`

### Этап 2: Консолидация дублирующей функциональности (Средний риск)

1. **Унифицировать функции фильтрации**:
   - Объединить `filterAndSortCardsWithSql` и `filterAndSortCards`
   - Создать единый интерфейс для запросов фильтрации

2. **Упростить цепочку реэкспортов**:
   - Сократить глубину реэкспортов с 3+ уровней до 1-2
   - Явно экспортировать только публичное API

3. **Стандартизировать сигнатуры функций**:
   - Единый порядок параметров для похожих функций
   - Консистентная обработка опциональных параметров

### Этап 3: Улучшение типизации и архитектуры (Высокий риск)

1. **Заменить "as any" на правильные типы**:
   - Добавить интерфейсы для Obsidian API
   - Использовать type guards вместо утверждений типов

2. **Разделить большие модули**:
   - Разбить `fsrs-table-filter.ts` на:
     - `interfaces/filter.ts` (типы)
     - `wasm-filter-adapter.ts` (адаптер WASM)
     - `card-filter.ts` (бизнес-логика)

3. **Внедрить четкие слои**:
   - Data layer (работа с файлами)
   - Business layer (WASM вычисления, FSRS алгоритм)
   - UI layer (команды, модальные окна, рендереры)

### Этап 4: Очистка и документация (Низкий риск)

1. **Убрать отладочный вывод**:
   - Удалить `console.info` и `console.warn` из продакшен кода
   - Заменить на структурированное логирование

2. **Обновить документацию**:
   - Четко указать, какие методы устарели
   - Предоставить migration path

3. **Добавить тесты**:
   - Покрыть критическую функциональность
   - Тестировать обработку ошибок

## Приоритеты исправлений

| Приоритет | Что исправить | Сложность | Риск |
|-----------|---------------|-----------|------|
| Высокий | Удалить функции-заглушки | Низкая | Низкий |
| Высокий | Удалить неиспользуемый код | Низкая | Низкий |
| Средний | Консолидировать дубликаты | Средняя | Средний |
| Средний | Убрать отладочный вывод | Низкая | Низкий |
| Низкий | Улучшить типизацию | Высокая | Высокий |
| Низкий | Рефакторинг архитектуры | Высокая | Высокий |

## Заключение

Кодовая база FSRS плагина содержит значительное количество "кривизн", накопленных за несколько итераций разработки. Наиболее проблемные области:

1. **Функции-заглушки** (7+ штук) - занимают место и вводят в заблуждение
2. **Дублирование** - две почти идентичные функции фильтрации
3. **Слабая типизация** - множественные "as any" и "as unknown"
4. **Загроможденные модули** - нарушение принципа единой ответственности

Рекомендуется начать с низкорисковых изменений (удаление неиспользуемого кода), затем перейти к консолидации дублирующей функциональности, и только потом к архитектурным улучшениям.

Ключевой метрикой успеха должно стать упрощение кодовой базы без потери функциональности и с сохранением обратной совместимости для публичного API.