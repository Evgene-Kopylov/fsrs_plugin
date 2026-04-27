Давайте разберёмся. Пользователь видит расхождение: FSRS-таблица показывает R=93.0%, а таблица истории просмотров — 90.2% для одной и той же карточки. Подозрение — где-то зашита константа вместо параметров из настроек.

Посмотрю структуру проекта и найду, где вычисляется retrievability в таблице истории.

Теперь я понимаю картину. Давайте посмотрю на константу 0.9 и где она используется в коде Rust по сравнению с request_retention из настроек. Также посмотрю, как `rs-fsrs` вычисляет retrievability.

## Разобрался. Вот что происходит.

### Два разных пути вычисления — два разных результата

Расхождение 93.0% vs 90.2% возникает потому, что **FSRS-таблица и таблица истории используют разные алгоритмы получения stability**, и из-за этого R тоже различается.

**Путь 1 — FSRS-таблица** (`compute_current_state` в `state_functions.rs`):
- Вызывает `create_card_from_last_session()`, который **просто копирует stability/difficulty из последнего ревью в YAML**.
- S = 7.4589 (прямо из YAML).
- R = 0.9^(5 / 7.4589) ≈ **93.0%** ✅

**Путь 2 — Таблица истории** (`compute_card_history` в том же файле):
- Начинает с дефолтной новой карточки и **полностью пересчитывает все повторения через `fsrs.repeat()`**, начиная с первого.
- Внутри `rs-fsrs` эта цепочка даёт другие значения stability, потому что алгоритм пересчитывает параметры с нуля, используя текущие w-параметры (Default).
- В итоге для последнего ревью получается S ≈ 5.1 (не 7.4589), а значит R = 0.9^(5/5.1) ≈ **90.2%**.

### Причина: `create_card_from_last_session` vs полный пересчёт

В `fsrs_logic.rs`:

```FSRS-plugin/wasm-lib/src/fsrs_logic.rs#L32-65
pub fn create_card_from_last_session(
    reviews: &[ReviewSession],
    default_stability: f64,
    default_difficulty: f64,
    parameters: &FsrsParameters,
) -> Card {
    // ...
    let last_session = reviews.last().unwrap();
    // stability берётся напрямую из последнего ревью!
    Card {
        stability: last_session.stability,
        difficulty: last_session.difficulty,
        // ...
    }
}
```

А `compute_card_history` не использует `create_card_from_last_session` — он делает полный цикл `fsrs.repeat()` для каждого ревью:

```FSRS-plugin/wasm-lib/src/state_functions.rs#L233-292
// Начальное состояние — дефолтная карточка
let mut current_card = Card { stability: default_stability, state: State::New, ... };
for (idx, session) in card.reviews.iter().enumerate() {
    // пересчёт через rs-fsrs с текущими параметрами
    let repeat_map = fsrs.repeat(current_card.clone(), review_date);
    let updated_card = repeat_map.get(&rating).unwrap().card.clone();
    // ...
    current_card = updated_card;
}
```

### Что с «зашитой request_retention»?

Ты прав, что подозреваешь зашитую константу, хотя это не прямая причина именно этого расхождения. Вот где она проявляется:

1. **`Card::get_retrievability` в библиотеке `rs-fsrs`** использует формулу `R = 0.9^(t/S)`. Цифра **0.9 — жёсткая константа**, она не берётся из `request_retention` в настройках (по умолчанию 0.92). Но это норма — формула retrievability в FSRS всегда использует 0.9 как базу забывания независимо от целевой retention. `request_retention` влияет только на расчёт интервала, а не на retrievability.

2. В `create_card_from_last_session` формула `scheduled_days = S * ln(request_retention) / ln(0.9)` — здесь `ln(0.9)` тоже константа, но это корректно, это формула FSRS.

### Что делать?

Нужно, чтобы оба места использовали один и тот же способ вычисления stability. Правильное решение — заставить `compute_card_history` и `compute_current_state` сходиться. Есть два варианта:

**Вариант А (рекомендуемый):** В `compute_current_state` тоже делать полный пересчёт через `fsrs.repeat()` вместо простого взятия последнего значения из YAML. Это дороже, но даёт консистентность.

**Вариант Б:** Передавать пересчитанные состояния из `compute_card_history` напрямую, минуя повторный вызов `compute_current_state`.

Какой подход предпочтительнее?
