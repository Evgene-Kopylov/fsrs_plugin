# stability_short_term: неверное условие для Hard

## Суть

В `wasm-lib/src/fsrs_schedule.rs` функция `stability_short_term` использует `rating >= 3`,
а канонический источник (`model.rs` в `fsrs-rs` @ `af8448e`) — `rating >= 2`.

## Детали

При same-day review (`delta_t == 0`) для **Hard (рейтинг 2)**:

| Реализация | Условие | Формула |
|---|---|---|
| `model.rs` (канон) | `rating >= 2` | `stability = s * max(sinc, 1.0)` |
| `fsrs_schedule.rs` (порт) | `rating >= 3` | `stability = s * sinc` |

`max(sinc, 1.0)` гарантирует, что стабильность не уменьшится при Hard.
Без него — заниженная стабильность.

## Источник расхождения

В том же репозитории `simulation.rs` содержит `rating >= 3` (вероятно, баг симуляции),
но канонической является `model.rs` — именно её использует `FSRS.next_states()`.

## Что сделать

Заменить в `wasm-lib/src/fsrs_schedule.rs`, функция `stability_short_term`:

```rust
if rating >= 3 {
```

на:

```rust
if rating >= 2 {
```

Также привести `S_MIN` с `0.01` к `0.001` (как в источнике).
