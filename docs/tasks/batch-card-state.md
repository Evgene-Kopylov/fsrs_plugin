# Единый батчевый computeCardsState

## Проблема

При сканировании хранилища `computeCardState` вызывается **4959 раз** (по разу на карточку). Каждый вызов:
1. Сериализует карточку в JSON (`JSON.stringify`)
2. Пересекает границу JS↔Rust (FFI)
3. Парсит результат (`JSON.parse`)

Overhead FFI + сериализации на 5000 вызовах даёт ~2.5с из 3.3с общего времени сканирования.

## Решение

Переделать API так, чтобы **всегда** передавался массив карточек — один путь для пачки и для одной карточки.

### Rust (wasm-lib)

```rust
pub fn compute_cards_state(cards_json: &str, now: &str, params_json: &str, default_stability: f64, default_difficulty: f64) -> String
```

Принимает JSON-массив карточек, возвращает JSON-массив состояний.

### TypeScript

Заменить `computeCardState(card, settings) → ComputedCardState` на:

```ts
computeCardsState(cards: ModernFSRSCard[], settings, now?, parametersJson?, nowStr?) → ComputedCardState[]
```

- В цикле сканирования: передавать весь batch одним вызовом
- В единичных вызовах (review, status bar): оборачивать карточку в `[card]`

Удалить старую `computeCardState` — не должно быть двух путей.

## Ожидаемый эффект

- Сканирование: ~3.3с → ~1.5-2.0с (один FFI вместо 5000)
- Единый API: всё через массив, никаких дублирующих функций
