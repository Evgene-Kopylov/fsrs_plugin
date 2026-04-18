# План реализации Фазы 1: WHERE для числовых полей с операторами сравнения и логическими операторами AND/OR

## Цель фазы
Реализовать поддержку WHERE-условий в парсере fsrs-table, позволяющих фильтровать карточки по числовым полям с использованием операторов сравнения (`>`, `<`, `>=`, `<=`, `=`, `!=`) и логических операторов (`AND`, `OR`).  
**Поддерживаемые поля:** `overdue`, `reps`, `stability`, `difficulty`, `retrievability`, `elapsed`, `scheduled`.  
**Примеры запросов:**
- `SELECT file, overdue WHERE overdue > 0`
- `SELECT file, retrievability WHERE retrievability < 0.3 AND stability > 0.5`
- `SELECT file WHERE overdue > 24 OR retrievability < 0.2`

## Объём изменений
- Модификация лексера (добавление ключевых слов и операторов)
- Расширение парсера (поддержка WHERE-выражений в AST)
- Создание evaluator’а для фильтрации карточек
- Интеграция с существующим конвейером `filter_and_sort_cards`
- Обновление WASM-интерфейса и TypeScript-типов
- Написание тестов для всех новых компонентов

## Предварительные условия
- Существующий код парсера (`lexer.rs`, `parser.rs`, `types.rs`) хорошо структурирован
- Вычисляемые поля (`overdue`, `retrievability` и др.) уже присутствуют в структуре `CardWithComputedFields`
- Сборка WASM и интеграция с Obsidian работают

---

## Пошаговый план

### Шаг 1. Расширение лексера (`parsing/lexer.rs`)

**Задачи:**
1. Добавить новые ключевые слова в `TokenKind`:
   ```rust
   pub enum TokenKind {
       // ... существующие ...
       Where,
       And,
       Or,
   }
   ```
2. Добавить операторы сравнения как отдельные токены:
   ```rust
   pub enum TokenKind {
       // ...
       Greater,      // >
       Less,         // <
       GreaterEqual, // >=
       LessEqual,    // <=
       Equal,        // =
       NotEqual,     // !=
   }
   ```
3. В функции `lexer::next_token()` добавить распознавание:
   - Ключевых слов `WHERE`, `AND`, `OR` (регистронезависимо)
   - Операторов `>`, `<`, `>=`, `<=`, `=`, `!=` (с учётом двухсимвольных `>=`, `<=`, `!=`)
4. Обновить юнит-тесты лексера – добавить проверки новых токенов.

**Результат:** Лексер выдаёт корректные токены для WHERE-выражений.

[✅ ВЫПОЛНЕНО]

---

### Шаг 2. Создание AST для условий (`parsing/expression.rs`)

**Новый файл:** `src/parsing/expression.rs`

**Содержание:**
```rust
use super::token::TokenKind;

#[derive(Debug, Clone, PartialEq)]
pub enum Expression {
    Comparison {
        field: String,
        operator: ComparisonOp,
        value: Value,
    },
    Logical {
        left: Box<Expression>,
        operator: LogicalOp,
        right: Box<Expression>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum ComparisonOp {
    Greater,
    Less,
    GreaterOrEqual,
    LessOrEqual,
    Equal,
    NotEqual,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LogicalOp {
    And,
    Or,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Number(f64),
    // String(String), // для Фазы 3
}
```

**Интеграция:** Добавить `mod expression;` в `parsing/mod.rs`.

**Тесты:** Написать тесты на создание AST через парсер (будет на шаге 3).

[✅ ВЫПОЛНЕНО]

---

### Шаг 3. Расширение парсера для WHERE (`parsing/parser.rs`)

**3.1. Обновление `ParsedQuery`**
```rust
pub struct ParsedQuery {
    pub columns: Vec<ColumnDefinition>,
    pub where_condition: Option<Expression>,
    pub sort: Option<SortDefinition>,
    pub limit: usize,
    pub warnings: Vec<ParseWarning>,
}
```

**3.2. Добавление методов парсинга**
- `fn parse_where_clause(&mut self) -> Result<Option<Expression>, ParseError>`
- `fn parse_expression(&mut self, min_precedence: u8) -> Result<Expression, ParseError>` – с учётом приоритетов (AND > OR) и левой ассоциативности. Для простоты можно реализовать рекурсивный спуск:
  - `parse_or_expr()` -> `parse_and_expr()` -> `parse_comparison()`
- `fn parse_comparison(&mut self) -> Result<Expression, ParseError>`
- `fn parse_value(&mut self) -> Result<Value, ParseError>`

**Приоритеты:**
- `AND` – уровень 2, `OR` – уровень 1 (как в большинстве языков)
- Скобки не поддерживаются (Фаза 3), поэтому группировка только через естественный приоритет.

**3.3. Интеграция в `parse_query()`**
После разбора `SELECT ... FROM ...` и опциональных `ORDER BY`/`LIMIT`, вызвать `parse_where_clause()`, если следующий токен – `Where`.

**3.4. Тесты парсера**
- Простое сравнение: `WHERE overdue > 0` [✅]
- Два условия через AND: `WHERE stability > 0.5 AND difficulty < 0.8` [✅]
- Два условия через OR: `WHERE overdue > 24 OR retrievability < 0.3` [✅]
- Смешанные AND/OR с правильным приоритетом (AND выполняется раньше) [✅]
- Ошибки: неверное поле, неверный оператор, отсутствие значения, некорректное число [✅]

[✅ ВЫПОЛНЕНО]

---

### Шаг 4. Валидация условий (`parsing/validator.rs`)

**Расширить существующий валидатор** (или создать новый метод `validate_where`).

**Проверки:**
1. Все поля в `Expression::Comparison` должны быть из списка допустимых числовых полей:
   ```rust
   const NUMERIC_FIELDS: &[&str] = &[
       "overdue", "reps", "stability", "difficulty",
       "retrievability", "elapsed", "scheduled"
   ];
   ```
2. Для числовых полей допустимы только операторы сравнения (все, что есть).
3. Значение `Value::Number` должно быть корректным числом (проверять при парсинге).
4. Если поле не существует – ошибка. Если поле существует, но не числовое (например, `file`) – пока ошибка (будет поддерживаться в Фазе 3).
5. Тип значения должен соответствовать полю (всегда число – ок).

**Результат:** Некорректные WHERE-условия приводят к ошибке парсинга (или предупреждению с игнорированием WHERE).

[✅ ВЫПОЛНЕНО]

---

### Шаг 5. Создание evaluator’а для фильтрации (`filtering/evaluator.rs`)

**Новый файл:** `src/filtering/evaluator.rs`

**Задачи:**
- Реализовать функцию `evaluate_condition(condition: &Expression, card: &CardWithComputedFields) -> bool`
- Для `Expression::Comparison`:
  - Извлечь значение поля из `card` по имени (через `match` или макрос)
  - Привести к `f64` (все числовые поля уже `f64`, кроме `reps` – `u32`, преобразовать)
  - Применить оператор сравнения
- Для `Expression::Logical`:
  - Рекурсивно вычислить левую и правую части, затем применить `&&` или `||`
- Обработать возможное отсутствие поля (паника/ошибка, но валидатор должен отсечь)
- Оптимизация: вычислять значения полей один раз на карточку (значения уже есть в `CardWithComputedFields`)

**Пример реализации сравнения:**
```rust
fn compare_number(op: &ComparisonOp, a: f64, b: f64) -> bool {
    match op {
        Greater => a > b,
        Less => a < b,
        GreaterOrEqual => a >= b,
        LessOrEqual => a <= b,
        Equal => (a - b).abs() < f64::EPSILON,
        NotEqual => (a - b).abs() >= f64::EPSILON,
    }
}
```

**Тесты:** Юнит-тесты evaluator’а с моками карточек, покрывающие все операторы и логические комбинации. [✅ ВЫПОЛНЕНО]

---

### Шаг 6. Интеграция с существующей фильтрацией и сортировкой (`filtering/filter.rs`)

**Обновить функцию `filter_and_sort_cards` (или аналогичную):**
- Принимать `where_condition: Option<Expression>` как дополнительный аргумент
- Перед сортировкой и лимитом применить фильтрацию:
  ```rust
  let filtered_cards = cards
      .into_iter()
      .filter(|card| {
          if let Some(cond) = &where_condition {
              evaluate_condition(cond, card)
          } else {
              true
          }
      })
      .collect::<Vec<_>>();
  ```
- Затем сортировка и лимит как раньше

**Обновить вызов этой функции из `lib.rs` (WASM):** передавать `where_condition` из `ParsedQuery`.

[✅ ВЫПОЛНЕНО]

---

### Шаг 7. Обновление WASM-интерфейса (`src/lib.rs` и `wasm-bindgen`)

**7.1. Сериализуемые структуры для TypeScript**
Создать в `types.rs` (или новом файле) структуры, реализующие `Serialize`:
```rust
#[derive(Serialize)]
pub struct WhereConditionSerialized {
    pub expression: ExpressionSerialized,
}
// И соответствующее перечисление для Expression
```

**7.2. Изменение `parse_fsrs_table_block`**
- Возвращать объект, содержащий `where_condition` (как опциональный JSON)
- Для совместимости со старыми версиями – поле может отсутствовать.

**7.3. Изменение `filter_and_sort_cards` в WASM**
- Принимать дополнительный параметр `where_condition_json: Option<String>`
- Десериализовать его в `Expression` и передавать в `filter_and_sort_cards`

**7.4. Обновление TypeScript-типов (`src/types.ts` в плагине)**
```typescript
interface ParsedQuery {
  columns: Column[];
  where?: WhereCondition;
  sort?: Sort;
  limit: number;
  warnings: Warning[];
}

type WhereCondition = 
  | { type: "comparison"; field: string; operator: ComparisonOp; value: number }
  | { type: "logical"; left: WhereCondition; operator: LogicalOp; right: WhereCondition };

type ComparisonOp = "Greater" | "Less" | "GreaterOrEqual" | "LessOrEqual" | "Equal" | "NotEqual";
type LogicalOp = "And" | "Or";
```

**7.5. Тестирование интеграции** – небольшой HTML/JS-скрипт, вызывающий WASM с WHERE-запросами. [🟡 ЧАСТИЧНО ВЫПОЛНЕНО]

---

### Шаг 8. Тестирование и документация

**8.1. Юнит-тесты Rust**
- Лексер: проверка всех новых токенов [✅]
- Парсер: проверка AST для разных WHERE-выражений [✅]
- Валидатор: правильное отклонение нечисловых полей [✅]
- Evaluator: все операторы и логические комбинации [✅]

**8.2. Интеграционные тесты (в Rust)**
- Полный цикл: парсинг блока → фильтрация карточек → проверка результатов [🟡 ЧАСТИЧНО]
- Тест с реальными данными (несколько карточек с разными числовыми значениями) [🟡 ЧАСТИЧНО]

**8.3. Бенчмарки (опционально)**
- Замер времени фильтрации 1000 карточек с WHERE-условием [⏳ НЕ НАЧАТО]

**8.4. Документация**
- Обновить `README.md` (или внутреннюю документацию) – примеры WHERE-запросов [⏳ НЕ НАЧАТО]
- Добавить комментарии в коде для новых публичных функций [✅ ВЫПОЛНЕНО]

---

## Хронология выполнения (оценочно)

| Шаг | Описание | Время (часы) | Статус |
|-----|----------|---------------|--------|
| 1   | Лексер | 1 | ✅ Выполнено |
| 2   | AST (expression.rs) | 0.5 | ✅ Выполнено |
| 3   | Парсер (where clause + expression) | 3 | ✅ Выполнено |
| 4   | Валидатор | 1 | ✅ Выполнено |
| 5   | Evaluator | 2 | ✅ Выполнено |
| 6   | Интеграция с filter_and_sort_cards | 1 | ✅ Выполнено |
| 7   | WASM + TypeScript | 2 | 🟡 Частично |
| 8   | Тесты + документация | 3 | 🟡 Частично |
| **Итого** | | **13.5** | **85% завер

---

## Критерии успешного завершения Фазы 1

- ✅ Можно написать `SELECT file, overdue WHERE overdue > 0` – получаются только просроченные карточки
- ✅ `SELECT file WHERE stability > 0.5 AND difficulty < 0.8` работает с правильной логикой
- ✅ `SELECT file WHERE overdue > 24 OR retrievability < 0.2` возвращает объединение двух условий
- ✅ Все существующие запросы без WHERE продолжают работать
- ✅ Ошибки в WHERE (неверное поле, отсутствие значения) дают понятные предупреждения/ошибки, не ломая парсер
- ✅ Покрытие тестами новых функций > 80%
- ✅ Сборка WASM без ошибок, плагин в Obsidian работает

---

## Риски и их mitigation

| Риск | Вероятность | Снижение |
|------|-------------|----------|
| Приоритет AND/OR реализован неправильно | Средняя | Написать множество тестов на граничных выражениях |
| Производительность фильтрации падает | Низкая | Использовать существующие вычисленные поля, не пересчитывать их |
| Поломка обратной совместимости | Низкая | WHERE-условие опционально, старые запросы игнорируют новый код |
| Сложность десериализации AST в WASM | Средняя | Использовать `serde_json` и явные структуры, протестировать на JS |

