# Как работает парсер SQL-запросов

Блок `fsrs-table` принимает SQL-подобный синтаксис. Парсер написан на Rust (WASM) и состоит из трёх этапов: **лексер**, **парсер**, **валидатор**.

## Этап 1: Лексер — режет текст на токены

На входе строка:

```sql
SELECT file, reps WHERE state = 'New' LIMIT 10
```

Лексер проходит посимвольно и выдаёт поток токенов:

```
KEYWORD("SELECT")  IDENT("file")  OP(",")  IDENT("reps")
KEYWORD("WHERE")   IDENT("state") OP("=")  STRING("New")
KEYWORD("LIMIT")   NUMBER(10)     EOF
```

**Ключевые слова:** `SELECT`, `ORDER`, `BY`, `ASC`, `DESC`, `LIMIT`, `AS`, `WHERE`, `AND`, `OR`.

Всё остальное — идентификаторы (имена полей), строки в кавычках (алиасы), числа (лимит), операторы (запятая, `=`, `!=`, `<`, `>`, `~`, `!~`).

Строки могут быть в двойных (`"Файл"`) или одинарных кавычках (`'New'`). Регистр ключевых слов не важен: `select`, `SELECT`, `Select` — одно и то же.

## Этап 2: Парсер — строит структуру запроса

Парсер читает токены и наполняет `ParsedQuery`:

```
ParsedQuery {
    columns: [file, reps],
    where_condition: state = 'New',
    sort: None,
    limit: 10,
    warnings: [],
}
```

**Порядок частей не важен.** Можно писать `SELECT ... LIMIT 10 WHERE ...` или `SELECT ... WHERE ... LIMIT 10` — результат одинаковый. Парсер сам разбирает, что есть что:

- Встретил `SELECT` → читает список колонок
- Встретил `WHERE` → читает выражение-условие
- Встретил `ORDER BY` → читает поле и направление
- Встретил `LIMIT` → читает число

### Выражения WHERE

`WHERE`-условие — это дерево выражений. Парсер собирает его рекурсивно, соблюдая приоритет `AND` над `OR`:

```
WHERE reps > 0 AND state = 'New' OR retrievability < 0.3
```

Превращается в:

```
OR
├── AND
│   ├── reps > 0
│   └── state = 'New'
└── retrievability < 0.3
```

Поддерживаемые операторы сравнения: `=`, `!=`, `<`, `>`, `<=`, `>=`, `~` (regex-совпадение), `!~` (regex-несовпадение).

### Колонки и алиасы

```sql
SELECT file, difficulty as "D", date_format(due, '%d.%m.%Y') as "Дата"
```

- `file` — просто поле
- `difficulty as "D"` — поле с заголовком «D»
- `date_format(due, '%d.%m.%Y')` — поле `due`, отформатированное по шаблону, с заголовком «Дата»

`SELECT *` раскрывается во все 9 доступных полей: `file`, `reps`, `stability`, `difficulty`, `retrievability`, `due`, `state`, `elapsed`, `scheduled`.

Единственная функция — `date_format`. Формат как в SQL: `%Y` — год, `%m` — месяц, `%d` — день, `%H` — час, `%M` — минута.

## Этап 3: Валидатор — проверяет осмысленность

После парсинга валидатор проверяет собранную структуру. Неизвестные поля — ошибка, таблица не рендерится. Некритичные проблемы — предупреждения:

| Проверка | Нарушение | Результат |
|---|---|---|
| Поле в SELECT существует? | `SELECT foo` | **Ошибка** «Неизвестное поле в SELECT: 'foo'» |
| Поле в WHERE существует? | `WHERE foo = 1` | **Ошибка** «Неизвестное поле в WHERE: 'foo'» |
| Поле в ORDER BY существует? | `ORDER BY foo` | **Ошибка** «Неизвестное поле в ORDER BY: 'foo'» |
| Лимит не слишком большой? | `LIMIT 99999` | Предупреждение `InvalidLimit` |

## Примеры ошибок парсинга

Ошибки этапа парсинга (не валидации) — критические, таблица не рендерится:

| Запрос | Ошибка |
|---|---|
| `ORDER BY due` | Нет `SELECT` |
| `SELECT` | Нет полей после SELECT |
| `SELECT * , file` | Запятая после `*` |
| `SELECT file LIMIT abc` | LIMIT требует число |
| `SELECT foo(bar)` | Неизвестная функция, только `date_format` |

## Связь с TypeScript

Парсер вызывается из TypeScript одной функцией:

```ts
import { parseSqlBlock } from "./utils/fsrs-table-params";

const params = parseSqlBlock('SELECT file, reps LIMIT 10');
// params.columns, params.sort, params.limit, params.where

const result = cache.query(params, new Date());
// result.cards, result.total_count, result.errors
```

Вся грамматика живёт в `wasm-lib/src/table_processing/parsing/`. Добавление новых полей — в `types.rs` (массив `AVAILABLE_FIELDS`). Новых операторов — в `lexer.rs` и `parser.rs`.
