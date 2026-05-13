# Ускорение хитмапа — раунд 2

## Текущее состояние

После ленивой загрузки reviews: **0.17 с**. Цель: **< 0.09 с**.

## Что осталось

- [x] **Заменить `reviews_by_date` на `count_by_date`** в `get_heatmap_data` (0.17→0.12 с)

Сейчас для каждой даты собирается `Vec<(path, rating)>` — клонирование путей, аллокации, хранение rating. Всё это только ради `.len()`. После выноса `reviews` в отдельный метод этот `Vec` не нужен.

**Было:**

```rust
let mut reviews_by_date: HashMap<String, Vec<(String, u8)>> = HashMap::new();
// ... push((file_path.clone(), session.rating))
let count = reviews.map_or(0, |r| r.len() as u32);
```

**Стало:**

```rust
let mut count_by_date: HashMap<String, u32> = HashMap::new();
// ... *entry += 1
let count = *count_by_date.get(&date_str).unwrap_or(&0);
```

- [x] **Предвыделить `cells`** — `Vec::with_capacity(weeks * 7)`

- [x] **DOM чанками** — попробовали, 0.12→0.11 с, откатили — не стоит усложнения

### Детали

#### `count_by_date` вместо `reviews_by_date`

### Файлы

- `wasm-lib/src/cache.rs` — пункты 1 и 2
- `src/ui/fsrs-heatmap-renderer.ts` — пункт 3

### Критерий готовности

- `get_heatmap_data` не аллоцирует `Vec` на каждую дату ✓
- Итог: **0.17 → 0.12 с** (цель < 0.09 не достигнута, но результат хороший)
