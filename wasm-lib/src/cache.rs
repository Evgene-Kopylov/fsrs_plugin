// Модуль кэша карточек FSRS
//
// Хранит глобальный `HashMap<String, CachedCard>` в памяти WASM.
// Все операции — через JSON для единообразия с остальными WASM-функциями.
//
//
// Используется из TypeScript как единый источник истины для состояний карточек.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::table_processing::types::TableParams;
use crate::types::{CardData, ComputedState};
use serde::{Deserialize, Serialize};
use wasm_bindgen::JsValue;

// ---------------------------------------------------------------------------
// Структуры данных
// ---------------------------------------------------------------------------

/// Карточка, хранящаяся в кэше вместе с её вычисленным состоянием
///
/// Хранит предварительно сериализованные JSON-строки (`card_json`, `state_json`),
/// чтобы при запросах не тратить время на повторную сериализацию структур.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedCard {
    pub card: CardData,
    pub state: ComputedState,
}

/// Элемент входного массива для `add_or_update_cards`
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CardInputItem {
    #[serde(rename = "filePath")]
    file_path: String,
    card_json: String,
    state_json: String,
}

/// Результат операции добавления/обновления
#[derive(Debug, Clone, Serialize)]
struct UpdateResult {
    updated: usize,
    errors: Vec<String>,
}

/// Результат операции удаления
#[derive(Debug, Clone, Serialize)]
struct RemoveResult {
    removed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

// ---------------------------------------------------------------------------
// Глобальный кэш
// ---------------------------------------------------------------------------

/// Возвращает ссылку на глобальный кэш (инициализируется при первом вызове)
fn global_cache() -> &'static Mutex<HashMap<String, CachedCard>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedCard>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

// ---------------------------------------------------------------------------
// WASM-функции
// ---------------------------------------------------------------------------

/// Инициализирует кэш (очищает, если уже существует).
/// Безопасно вызывать многократно.
pub fn init_cache() {
    global_cache().lock().unwrap().clear();
}

/// Полностью очищает кэш.
pub fn clear_cache() {
    global_cache().lock().unwrap().clear();
}

/// Пакетное добавление или обновление карточек в кэше.
///
/// Принимает JSON-массив объектов:
/// ```json
/// [
///   {
///     "filePath": "/path/to/file.md",
///     "card_json": "{\"reviews\": [...]}",
///     "state_json": "{\"due\": \"...\", \"stability\": 5.0, ...}"
///   }
/// ]
/// ```
///
/// Возвращает JSON: `{"updated": <число>, "errors": [...]}`
pub fn add_or_update_cards(cards_json_array: &str) -> String {
    add_or_update_cards_inner(cards_json_array)
}

/// Принимает JS-массив объектов напрямую.
/// Для каждой карточки: JSON.stringify → serde_json::from_str.
pub fn add_or_update_cards_js(cards: JsValue) -> String {
    add_or_update_cards_inner_js(cards)
}

fn add_or_update_cards_inner(cards_json_array: &str) -> String {
    let cache = global_cache();

    // Парсим входной массив
    let items: Vec<CardInputItem> = match serde_json::from_str(cards_json_array) {
        Ok(items) => items,
        Err(e) => {
            return serde_json::to_string(&serde_json::json!({
                "updated": 0,
                "errors": [format!("Ошибка парсинга входного массива: {}", e)]
            }))
            .unwrap_or_else(|_| r#"{"updated":0,"errors":["serialization error"]}"#.to_string());
        }
    };

    let mut updated = 0usize;
    let mut errors: Vec<String> = Vec::new();

    {
        let mut map = cache.lock().unwrap();

        for item in &items {
            // Парсим карточку и проставляем file_path (он передаётся отдельно)
            let mut card: CardData = match serde_json::from_str(&item.card_json) {
                Ok(c) => c,
                Err(e) => {
                    errors.push(format!(
                        "Ошибка парсинга card_json для '{}': {}",
                        item.file_path, e
                    ));
                    continue;
                }
            };
            card.file_path = Some(item.file_path.clone());

            // Парсим состояние
            let state: ComputedState = match serde_json::from_str(&item.state_json) {
                Ok(s) => s,
                Err(e) => {
                    errors.push(format!(
                        "Ошибка парсинга state_json для '{}': {}",
                        item.file_path, e
                    ));
                    continue;
                }
            };

            // Вставляем или обновляем в кэше
            map.insert(item.file_path.clone(), CachedCard { card, state });
            updated += 1;
        }
    }

    let result = UpdateResult { updated, errors };
    serde_json::to_string(&result)
        .unwrap_or_else(|_| r#"{"updated":0,"errors":["serialization error"]}"#.to_string())
}

fn add_or_update_cards_inner_js(cards: JsValue) -> String {
    let arr = js_sys::Array::from(&cards);
    let cache = global_cache();
    let mut updated = 0usize;
    let mut errors: Vec<String> = Vec::new();

    {
        let mut map = cache.lock().unwrap();
        for item in arr.iter() {
            let file_path = js_sys::Reflect::get(&item, &JsValue::from_str("filePath"))
                .unwrap_or_default()
                .as_string()
                .unwrap_or_default();

            if file_path.is_empty() {
                continue;
            }

            let card_js =
                js_sys::Reflect::get(&item, &JsValue::from_str("card")).unwrap_or_default();
            let state_js =
                js_sys::Reflect::get(&item, &JsValue::from_str("state")).unwrap_or_default();

            // JSON.stringify → serde_json::from_str
            let card_json = js_sys::JSON::stringify(&card_js)
                .map(|s| s.as_string().unwrap_or_default())
                .unwrap_or_default();
            let state_json = js_sys::JSON::stringify(&state_js)
                .map(|s| s.as_string().unwrap_or_default())
                .unwrap_or_default();

            let mut card: CardData = match serde_json::from_str(&card_json) {
                Ok(c) => c,
                Err(e) => {
                    errors.push(format!("Карточка '{}': {}", file_path, e));
                    continue;
                }
            };
            card.file_path = Some(file_path.clone());

            let state: ComputedState = match serde_json::from_str(&state_json) {
                Ok(s) => s,
                Err(e) => {
                    errors.push(format!("Состояние '{}': {}", file_path, e));
                    continue;
                }
            };

            map.insert(file_path, CachedCard { card, state });
            updated += 1;
        }
    }

    let result = UpdateResult { updated, errors };
    serde_json::to_string(&result).unwrap_or_default()
}

/// Удаляет карточку из кэша по пути файла.
///
/// Возвращает JSON: `{"removed": true}` или `{"removed": false, "reason": "not_found"}`
pub fn remove_card(file_path: &str) -> String {
    let cache = global_cache();
    let mut map = cache.lock().unwrap();

    if map.remove(file_path).is_some() {
        let result = RemoveResult {
            removed: true,
            reason: None,
        };
        serde_json::to_string(&result)
            .unwrap_or_else(|_| r#"{"removed":false,"reason":"serialization error"}"#.to_string())
    } else {
        let result = RemoveResult {
            removed: false,
            reason: Some("not_found".to_string()),
        };
        serde_json::to_string(&result)
            .unwrap_or_else(|_| r#"{"removed":false,"reason":"serialization error"}"#.to_string())
    }
}

/// Возвращает все карточки из кэша в формате JSON (для отладки).
///
/// Формат:
/// ```json
/// [
///   {
///     "filePath": "...",
///     "card": {"reviews": [...]},
///     "state": {"due": "...", "stability": 5.0, ...}
///   }
/// ]
/// ```
pub fn get_all_cards() -> String {
    let cache = global_cache();
    let map = cache.lock().unwrap();

    // Собираем массив для сериализации
    let entries: Vec<serde_json::Value> = map
        .iter()
        .map(|(file_path, cached)| {
            serde_json::json!({
                "filePath": file_path,
                "card": cached.card,
                "state": cached.state,
            })
        })
        .collect();

    serde_json::to_string(&entries).unwrap_or_else(|_| "[]".to_string())
}

/// Возвращает количество карточек в кэше.
pub fn get_cache_size() -> usize {
    let cache = global_cache();
    let map = cache.lock().unwrap();
    map.len()
}

/// Возвращает полные данные для рендеринга тепловой карты.
///
/// Все вычисления и строки формируются в Rust:
/// - подсчёт повторений по датам из кэша
/// - уровни цвета (0-4)
/// - позиции месяцев
/// - локализованные названия месяцев, дней недели, тултипы, заголовок
///
/// TS только создаёт DOM-элементы и вставляет готовые строки.
pub fn get_heatmap_data(now_iso: &str, weeks: usize, locale: &str) -> String {
    use chrono::{Datelike, Duration, NaiveDate};

    let now = match NaiveDate::parse_from_str(&now_iso[..10], "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => {
            return serde_json::to_string(&serde_json::json!({"error": "invalid date"}))
                .unwrap_or_else(|_| "{}".to_string());
        }
    };

    let is_ru = locale == "ru";

    // Локализованные строки
    let (month_names, day_labels, title, reviews_forms): ([&str; 12], [&str; 7], &str, [&str; 3]) =
        if is_ru {
            (
                [
                    "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя",
                    "Дек",
                ],
                ["", "Пн", "", "Ср", "", "Пт", ""],
                "Повторения",
                ["повторение", "повторения", "повторений"],
            )
        } else {
            (
                [
                    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov",
                    "Dec",
                ],
                ["", "Mon", "", "Wed", "", "Fri", ""],
                "Reviews",
                ["review", "reviews", "reviews"],
            )
        };

    // Строим ячейки
    // Диапазон дат: конец = суббота текущей недели
    let weekday = now.weekday().num_days_from_monday();
    let end_date = now + Duration::days(6 - weekday as i64);
    let total_days = (weeks * 7) as i64;
    let start_date = end_date - Duration::days(total_days - 1);

    // Собираем повторения из кэша: дата → количество
    let cache = global_cache();
    let map = cache.lock().unwrap();
    let mut count_by_date: HashMap<String, u32> = HashMap::new();
    for (_file_path, cached) in map.iter() {
        for session in &cached.card.reviews {
            let date_str: String = session.date.chars().take(10).collect();
            *count_by_date.entry(date_str).or_default() += 1;
        }
    }

    // Строим ячейки
    let mut cells: Vec<serde_json::Value> = Vec::with_capacity(weeks * 7);
    let mut d = start_date;
    while d <= end_date {
        let date_str = d.format("%Y-%m-%d").to_string();
        let count = count_by_date.get(&date_str).copied().unwrap_or(0);
        let level = color_level(count);
        let future = d > now;

        // Флаги границ для визуального разделения месяцев
        let mon_idx = d.weekday().num_days_from_monday();
        let day_num = d.day();
        let last_day = last_day_of_month(d);
        let border_top = mon_idx == 0 || day_num == 1;
        let border_bottom = mon_idx == 6 || d == last_day;
        let border_left = day_num == 1 || day_num <= 7;
        let border_right = d == last_day || day_num >= last_day.day().saturating_sub(6);

        // Формируем тултип: только количество, дату отформатирует TS через moment
        let review_word = plural_ru(count, &reviews_forms);
        let tooltip = format!("{} {}", count, review_word);

        cells.push(serde_json::json!({
            "date": date_str,
            "count": count,
            "level": level,
            "future": future,
            "tooltip": tooltip,
            "border_top": border_top,
            "border_bottom": border_bottom,
            "border_left": border_left,
            "border_right": border_right,
        }));

        d += Duration::days(1);
    }

    // Позиции месяцев
    let month_positions = compute_month_positions(start_date, weeks);

    let result = serde_json::json!({
        "title": title,
        "month_names": month_names,
        "day_labels": day_labels,
        "cells": cells,
        "month_positions": month_positions,
        "weeks": weeks,
    });

    serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string())
}

/// Возвращает все reviews для диапазона хитмапа: дата → [{file, path, rating}]
pub fn get_heatmap_reviews(now_iso: &str, weeks: usize) -> String {
    use chrono::{Datelike, Duration, NaiveDate};

    let now = match NaiveDate::parse_from_str(&now_iso[..10], "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => {
            return serde_json::to_string(&serde_json::json!({"error": "invalid date"}))
                .unwrap_or_else(|_| "{}".to_string());
        }
    };

    let weekday = now.weekday().num_days_from_monday();
    let end_date = now + Duration::days(6 - weekday as i64);
    let total_days = (weeks * 7) as i64;
    let start_date = end_date - Duration::days(total_days - 1);

    let cache = global_cache();
    let map = cache.lock().unwrap();

    let mut result: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
    for (file_path, cached) in map.iter() {
        for session in &cached.card.reviews {
            let date_str: String = session.date.chars().take(10).collect();
            let d = match NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
                Ok(d) => d,
                Err(_) => continue,
            };
            if d < start_date || d > end_date {
                continue;
            }
            let name = file_path.rsplit('/').next().unwrap_or(file_path);
            let entry = result
                .entry(date_str)
                .or_insert_with(|| serde_json::json!([]));
            if let Some(arr) = entry.as_array_mut() {
                arr.push(serde_json::json!({
                    "file": name,
                    "path": file_path,
                    "rating": session.rating,
                }));
            }
        }
    }

    serde_json::to_string(&serde_json::Value::Object(result)).unwrap_or_else(|_| "{}".to_string())
}

fn color_level(count: u32) -> u32 {
    const T: [u32; 19] = [
        0, 1, 3, 5, 8, 11, 14, 17, 21, 25, 29, 33, 37, 41, 44, 47, 49, 50, 50,
    ];
    for i in (0..T.len()).rev() {
        if count >= T[i] {
            return i as u32;
        }
    }
    0
}

fn last_day_of_month(d: chrono::NaiveDate) -> chrono::NaiveDate {
    use chrono::Datelike;
    let next = if d.month() == 12 {
        chrono::NaiveDate::from_ymd_opt(d.year() + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(d.year(), d.month() + 1, 1)
    };
    next.unwrap_or(d) - chrono::Duration::days(1)
}

fn plural_ru<'a>(n: u32, forms: &'a [&'a str; 3]) -> &'a str {
    let m = n % 100;
    let m1 = m % 10;
    if m > 10 && m < 20 {
        return forms[2];
    }
    if m1 == 1 {
        forms[0]
    } else if (2..=4).contains(&m1) {
        forms[1]
    } else {
        forms[2]
    }
}

fn compute_month_positions(start: chrono::NaiveDate, weeks: usize) -> Vec<serde_json::Value> {
    use chrono::{Datelike, Duration};
    let mut pos: Vec<serde_json::Value> = Vec::new();
    let mut last: i32 = -1;
    let mut first_week: usize = 0;
    for w in 0..weeks {
        let d = start + Duration::days((w * 7) as i64);
        let m = d.month0() as i32;
        if m != last {
            if last != -1 {
                let lw = (first_week + 1).min(weeks - 1);
                pos.push(serde_json::json!({"month": last, "week": lw}));
            }
            last = m;
            first_week = w;
        }
    }
    if last != -1 {
        let lw = (first_week + 1).min(weeks - 1);
        pos.push(serde_json::json!({"month": last, "week": lw}));
    }
    pos
}

/// Запрашивает карточки из кэша с фильтрацией, сортировкой и лимитом.
///
/// Принимает JSON с параметрами таблицы (TableParams) и текущее время ISO.
/// Возвращает JSON с полями: `cards`, `total_count`, `errors`.
///
/// Формат результата:
/// ```json
/// {
///   "cards": [
///     {
///       "card_json": "...",
///       "computed_fields": { "file": "...", "retrievability": 0.9, ... }
///     }
///   ],
///   "total_count": 10,
///   "errors": []
/// }
/// ```
pub fn query_cards(params_json: &str, now_iso: &str) -> String {
    // Парсим параметры
    let params: TableParams = match serde_json::from_str(params_json) {
        Ok(p) => p,
        Err(e) => {
            return serde_json::to_string(&serde_json::json!({
                "cards": [],
                "total_count": 0,
                "errors": [format!("Ошибка парсинга params_json: {}", e)]
            }))
            .unwrap_or_else(|_| {
                r#"{"cards":[],"total_count":0,"errors":["serialization error"]}"#.to_string()
            });
        }
    };

    // Получаем все карточки из кэша
    let all_cards = get_all_cached_cards();
    if all_cards.is_empty() {
        return serde_json::to_string(&serde_json::json!({
            "cards": [],
            "total_count": 0,
            "errors": []
        }))
        .unwrap_or_else(|_| r#"{"cards":[],"total_count":0,"errors":[]}"#.to_string());
    }

    // Используем готовые структуры из кэша, без JSON-сериализации
    let pairs: Vec<(CardData, ComputedState)> = all_cards
        .iter()
        .map(|(_, cached)| (cached.card.clone(), cached.state.clone()))
        .collect();

    // Вызываем filter_and_sort_cards_with_states
    match crate::table_processing::filtering::filter_and_sort_cards_with_states(
        &pairs, &params, "{}", now_iso,
    ) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|_| {
            r#"{"cards":[],"total_count":0,"errors":["serialization error"]}"#.to_string()
        }),
        Err(e) => serde_json::to_string(&serde_json::json!({
            "cards": [],
            "total_count": 0,
            "errors": [format!("Ошибка фильтрации: {}", e)]
        }))
        .unwrap_or_else(|_| {
            r#"{"cards":[],"total_count":0,"errors":["serialization error"]}"#.to_string()
        }),
    }
}

/// Запрашивает только количество карточек из кэша по заданным параметрам.
///
/// Быстрее, чем `query_cards`, так как не возвращает карточки.
/// Возвращает JSON: `{"total_count": N, "errors": [...]}`
pub fn query_cards_count(params_json: &str, now_iso: &str) -> String {
    let result_json = query_cards(params_json, now_iso);

    // Извлекаем только total_count и errors из результата
    match serde_json::from_str::<serde_json::Value>(&result_json) {
        Ok(val) => {
            let total = val.get("total_count").and_then(|v| v.as_u64()).unwrap_or(0);
            let errors = val
                .get("errors")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![]));
            serde_json::to_string(&serde_json::json!({
                "total_count": total,
                "errors": errors
            }))
            .unwrap_or_else(|_| r#"{"total_count":0,"errors":[]}"#.to_string())
        }
        Err(_) => r#"{"total_count":0,"errors":["failed to parse query result"]}"#.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Внутренние функции (для вызова из других модулей Rust)
// ---------------------------------------------------------------------------

/// Возвращает все карточки из кэша как вектор пар (путь, CachedCard)
/// для использования внутри Rust без сериализации в JSON.
pub fn get_all_cached_cards() -> Vec<(String, CachedCard)> {
    let cache = global_cache();
    let map = cache.lock().unwrap();
    map.iter()
        .map(|(path, card)| (path.clone(), card.clone()))
        .collect()
}

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Мьютекс для последовательного выполнения тестов кэша
    /// (глобальное состояние в статике требует синхронизации)
    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    /// Захватывает тестовый мьютекс (возвращает гард, который удерживается до конца теста)
    fn acquire_test_lock() -> std::sync::MutexGuard<'static, ()> {
        TEST_MUTEX.lock().unwrap()
    }

    /// Вспомогательная функция для создания тестовой карточки с состоянием
    fn make_test_item(file_path: &str, rating: u8, due: &str) -> CardInputItem {
        let card = CardData {
            reviews: vec![crate::types::ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating,
            }],
            file_path: Some(file_path.to_string()),
        };
        let state = ComputedState {
            due: due.to_string(),
            stability: 5.0,
            difficulty: 3.0,
            state: "Review".to_string(),
            elapsed_days: 10,
            scheduled_days: 30,
            reps: 5,
            lapses: 1,
            retrievability: 0.9,
        };

        CardInputItem {
            file_path: file_path.to_string(),
            card_json: serde_json::to_string(&card).unwrap(),
            state_json: serde_json::to_string(&state).unwrap(),
        }
    }

    #[test]
    fn test_init_and_clear() {
        let _lock = acquire_test_lock();
        init_cache();
        assert_eq!(get_cache_size(), 0);

        // Добавляем что-то, потом очищаем
        let item = make_test_item("t_init_clear.md", 2, "2026-06-01T10:00:00Z");
        let input = serde_json::to_string(&vec![item]).unwrap();
        add_or_update_cards(&input);
        assert_eq!(get_cache_size(), 1);

        clear_cache();
        assert_eq!(get_cache_size(), 0);
    }

    #[test]
    fn test_add_or_update_cards() {
        let _lock = acquire_test_lock();
        init_cache();

        // Добавляем две карточки
        let items = vec![
            make_test_item("t_add_a.md", 2, "2026-06-01T10:00:00Z"),
            make_test_item("t_add_b.md", 3, "2026-06-05T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        let result = add_or_update_cards(&input);

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["updated"].as_u64().unwrap(), 2);
        assert_eq!(get_cache_size(), 2);

        // Проверяем, что карточки действительно добавлены
        let all = get_all_cached_cards();
        let cached = all.iter().find(|(path, _)| path == "t_add_a.md");
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().1.state.stability, 5.0);
    }

    #[test]
    fn test_update_existing() {
        let _lock = acquire_test_lock();
        init_cache();

        // Добавляем карточку
        let item = make_test_item("t_update_original.md", 2, "2026-06-01T10:00:00Z");
        let input = serde_json::to_string(&vec![item]).unwrap();
        add_or_update_cards(&input);
        assert_eq!(get_cache_size(), 1);

        // Обновляем ту же карточку с новыми данными
        let card = CardData {
            reviews: vec![
                crate::types::ReviewSession {
                    date: "2026-01-01T10:00:00Z".to_string(),
                    rating: 2,
                },
                crate::types::ReviewSession {
                    date: "2026-02-01T10:00:00Z".to_string(),
                    rating: 3,
                },
            ],
            file_path: Some("t_update_original.md".to_string()),
        };
        let state = ComputedState {
            due: "2026-07-01T10:00:00Z".to_string(),
            stability: 10.0,
            difficulty: 2.5,
            state: "Review".to_string(),
            elapsed_days: 20,
            scheduled_days: 60,
            reps: 6,
            lapses: 1,
            retrievability: 0.95,
        };

        let updated_item = CardInputItem {
            file_path: "t_update_original.md".to_string(),
            card_json: serde_json::to_string(&card).unwrap(),
            state_json: serde_json::to_string(&state).unwrap(),
        };

        let input = serde_json::to_string(&vec![updated_item]).unwrap();
        let result = add_or_update_cards(&input);

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["updated"].as_u64().unwrap(), 1);

        // Проверяем, что состояние обновилось
        let all = get_all_cached_cards();
        let cached = all
            .iter()
            .find(|(path, _)| path == "t_update_original.md")
            .unwrap();
        assert_eq!(cached.1.state.stability, 10.0);
        assert_eq!(cached.1.card.reviews.len(), 2);
        // Размер кэша не должен увеличиться
        assert_eq!(get_cache_size(), 1);
    }

    #[test]
    fn test_remove_card() {
        let _lock = acquire_test_lock();
        init_cache();

        // Удаление несуществующей карточки
        let result = remove_card("t_remove_nonexistent.md");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["removed"].as_bool().unwrap(), false);
        assert_eq!(parsed["reason"].as_str().unwrap(), "not_found");

        // Добавляем и удаляем
        let item = make_test_item("t_remove_target.md", 2, "2026-06-01T10:00:00Z");
        let input = serde_json::to_string(&vec![item]).unwrap();
        add_or_update_cards(&input);
        assert_eq!(get_cache_size(), 1);

        let result = remove_card("t_remove_target.md");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["removed"].as_bool().unwrap(), true);
        assert_eq!(get_cache_size(), 0);
    }

    #[test]
    fn test_get_all_cards() {
        let _lock = acquire_test_lock();
        init_cache();

        // Пустой кэш
        let all = get_all_cards();
        assert_eq!(all, "[]");

        // Добавляем одну карточку
        let item = make_test_item("t_getall_1.md", 2, "2026-06-01T10:00:00Z");
        let input = serde_json::to_string(&vec![item]).unwrap();
        add_or_update_cards(&input);

        let all = get_all_cards();
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&all).unwrap();
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0]["filePath"].as_str().unwrap(), "t_getall_1.md");
        assert!(parsed[0].get("card").is_some());
        assert!(parsed[0].get("state").is_some());
    }

    #[test]
    fn test_invalid_input() {
        let _lock = acquire_test_lock();
        init_cache();

        // Передаём невалидный JSON
        let result = add_or_update_cards("not json at all");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["updated"].as_u64().unwrap(), 0);
        assert!(!parsed["errors"].as_array().unwrap().is_empty());
        assert_eq!(get_cache_size(), 0);

        // Передаём массив с невалидными данными внутри
        let bad_input = r#"[
            {
                "filePath": "bad.md",
                "card_json": "{{{invalid}}}",
                "state_json": "{}"
            }
        ]"#;
        let result = add_or_update_cards(bad_input);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["updated"].as_u64().unwrap(), 0);
        assert!(!parsed["errors"].as_array().unwrap().is_empty());
    }

    #[test]
    fn test_mixed_valid_and_invalid() {
        let _lock = acquire_test_lock();
        init_cache();

        // Одна хорошая, одна плохая
        let good_item = make_test_item("t_mixed_good.md", 2, "2026-06-01T10:00:00Z");
        let bad_item = CardInputItem {
            file_path: "t_mixed_bad.md".to_string(),
            card_json: "{{{invalid}}}".to_string(),
            state_json: "{}".to_string(),
        };

        let items = vec![good_item, bad_item];
        let input = serde_json::to_string(&items).unwrap();
        let result = add_or_update_cards(&input);

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["updated"].as_u64().unwrap(), 1);
        assert_eq!(parsed["errors"].as_array().unwrap().len(), 1);
        assert_eq!(get_cache_size(), 1);
    }

    #[test]
    fn test_get_all_cached_cards_internal() {
        let _lock = acquire_test_lock();
        init_cache();

        let items = vec![
            make_test_item("t_internal_a.md", 2, "2026-06-01T10:00:00Z"),
            make_test_item("t_internal_b.md", 3, "2026-06-05T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        let all = get_all_cached_cards();
        assert_eq!(all.len(), 2);

        let paths: Vec<&str> = all.iter().map(|(p, _)| p.as_str()).collect();
        assert!(paths.contains(&"t_internal_a.md"));
        assert!(paths.contains(&"t_internal_b.md"));
    }

    // -----------------------------------------------------------------------
    // Тесты query_cards и query_cards_count
    // -----------------------------------------------------------------------

    #[test]
    fn test_query_cards_empty_cache() {
        let _lock = acquire_test_lock();
        init_cache();

        let params = crate::table_processing::types::TableParams {
            columns: vec![],
            limit: 10,
            sort: None,
            where_condition: None,
        };
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 0);
        assert_eq!(parsed["cards"].as_array().unwrap().len(), 0);
        assert!(parsed["errors"].as_array().unwrap().is_empty());
    }

    #[test]
    fn test_query_cards_with_data() {
        let _lock = acquire_test_lock();
        init_cache();

        let items = vec![
            make_test_item("t_qdata_a.md", 2, "2026-06-01T10:00:00Z"),
            make_test_item("t_qdata_b.md", 3, "2026-06-05T10:00:00Z"),
            make_test_item("t_qdata_c.md", 1, "2026-06-10T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        let params = crate::table_processing::types::TableParams {
            columns: vec![crate::table_processing::types::TableColumn {
                field: "file".to_string(),
                title: "File".to_string(),
                width: None,
                date_format: None,
            }],
            limit: 10,
            sort: None,
            where_condition: None,
        };
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 3);
        assert_eq!(parsed["cards"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_query_cards_with_where_file_stem() {
        let _lock = acquire_test_lock();
        init_cache();

        let items = vec![
            make_test_item("папка/Запись.md", 2, "2026-06-01T10:00:00Z"),
            make_test_item("папка/Другая.md", 3, "2026-06-05T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        // Парсим полную SQL-строку как в Obsidian
        let parsed_sql = crate::table_processing::parsing::parse_fsrs_table_block(
            "SELECT file WHERE file = \"Запись\" LIMIT 10",
        )
        .unwrap();
        let params_json = serde_json::to_string(&parsed_sql.value).unwrap();
        let result = query_cards(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(
            parsed["total_count"].as_u64().unwrap(),
            1,
            "WHERE file = \"Запись\" должно найти 1 карточку"
        );
        assert_eq!(parsed["cards"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_query_cards_with_where_file_spaces_parens() {
        let _lock = acquire_test_lock();
        init_cache();

        let items = vec![make_test_item(
            "папка/Танзанит ( Tanzanite ).md",
            2,
            "2026-06-01T10:00:00Z",
        )];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        // Парсим полную SQL-строку как в Obsidian
        let parsed_sql = crate::table_processing::parsing::parse_fsrs_table_block(
            "SELECT file WHERE file = \"Танзанит ( Tanzanite )\" LIMIT 10",
        )
        .unwrap();
        let params_json = serde_json::to_string(&parsed_sql.value).unwrap();
        let result = query_cards(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(
            parsed["total_count"].as_u64().unwrap(),
            1,
            "WHERE file = \"Танзанит ( Tanzanite )\" должно найти 1 карточку"
        );
    }

    #[test]
    fn test_query_cards_with_limit() {
        let _lock = acquire_test_lock();
        init_cache();

        let items = vec![
            make_test_item("t_qlimit_a.md", 2, "2026-06-01T10:00:00Z"),
            make_test_item("t_qlimit_b.md", 3, "2026-06-05T10:00:00Z"),
            make_test_item("t_qlimit_c.md", 1, "2026-06-10T10:00:00Z"),
            make_test_item("t_qlimit_d.md", 2, "2026-06-15T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        let params = crate::table_processing::types::TableParams {
            columns: vec![],
            limit: 2,
            sort: None,
            where_condition: None,
        };
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 4);
        assert_eq!(parsed["cards"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_query_cards_with_sort() {
        let _lock = acquire_test_lock();
        init_cache();

        let card_a = CardData {
            reviews: vec![crate::types::ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 2,
            }],
            file_path: Some("t_qsort_a.md".to_string()),
        };
        let state_a = ComputedState {
            due: "2026-06-01T10:00:00Z".to_string(),
            stability: 5.0,
            difficulty: 3.0,
            state: "Review".to_string(),
            elapsed_days: 10,
            scheduled_days: 30,
            reps: 5,
            lapses: 1,
            retrievability: 0.9,
        };
        let card_b = CardData {
            reviews: vec![crate::types::ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 3,
            }],
            file_path: Some("t_qsort_b.md".to_string()),
        };
        let state_b = ComputedState {
            due: "2026-06-05T10:00:00Z".to_string(),
            stability: 10.0,
            difficulty: 2.5,
            state: "Review".to_string(),
            elapsed_days: 20,
            scheduled_days: 60,
            reps: 6,
            lapses: 0,
            retrievability: 0.95,
        };
        let card_c = CardData {
            reviews: vec![crate::types::ReviewSession {
                date: "2026-01-01T10:00:00Z".to_string(),
                rating: 2,
            }],
            file_path: Some("t_qsort_c.md".to_string()),
        };
        let state_c = ComputedState {
            due: "2026-06-10T10:00:00Z".to_string(),
            stability: 2.0,
            difficulty: 4.0,
            state: "Review".to_string(),
            elapsed_days: 5,
            scheduled_days: 15,
            reps: 3,
            lapses: 2,
            retrievability: 0.8,
        };

        let items = vec![
            CardInputItem {
                file_path: "t_qsort_a.md".to_string(),
                card_json: serde_json::to_string(&card_a).unwrap(),
                state_json: serde_json::to_string(&state_a).unwrap(),
            },
            CardInputItem {
                file_path: "t_qsort_b.md".to_string(),
                card_json: serde_json::to_string(&card_b).unwrap(),
                state_json: serde_json::to_string(&state_b).unwrap(),
            },
            CardInputItem {
                file_path: "t_qsort_c.md".to_string(),
                card_json: serde_json::to_string(&card_c).unwrap(),
                state_json: serde_json::to_string(&state_c).unwrap(),
            },
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        let params = crate::table_processing::types::TableParams {
            columns: vec![],
            limit: 10,
            sort: Some(crate::table_processing::types::SortParam {
                field: "stability".to_string(),
                direction: crate::table_processing::types::SortDirection::Desc,
            }),
            where_condition: None,
        };
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 3);
        let cards = parsed["cards"].as_array().unwrap();
        assert_eq!(cards.len(), 3);

        if let Some(first_card) = cards[0].get("computed_fields") {
            let stability = first_card.get("stability").and_then(|v| v.as_f64());
            assert_eq!(stability, Some(10.0));
        }
        if let Some(last_card) = cards[2].get("computed_fields") {
            let stability = last_card.get("stability").and_then(|v| v.as_f64());
            assert_eq!(stability, Some(2.0));
        }
    }

    #[test]
    fn test_query_cards_count() {
        let _lock = acquire_test_lock();
        init_cache();

        let items = vec![
            make_test_item("t_qcount_a.md", 2, "2026-06-01T10:00:00Z"),
            make_test_item("t_qcount_b.md", 3, "2026-06-05T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        let params = crate::table_processing::types::TableParams {
            columns: vec![],
            limit: 10,
            sort: None,
            where_condition: None,
        };
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards_count(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 2);
        assert!(parsed.get("cards").is_none());
    }

    #[test]
    fn test_query_cards_count_empty() {
        let _lock = acquire_test_lock();
        init_cache();

        let params = crate::table_processing::types::TableParams {
            columns: vec![],
            limit: 10,
            sort: None,
            where_condition: None,
        };
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards_count(&params_json, "2026-06-10T12:00:00Z");

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 0);
    }

    #[test]
    fn test_query_cards_invalid_params() {
        let _lock = acquire_test_lock();
        init_cache();

        let result = query_cards("not valid json", "2026-06-10T12:00:00Z");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 0);
        assert!(!parsed["errors"].as_array().unwrap().is_empty());
        assert!(parsed["cards"].as_array().unwrap().is_empty());
    }

    #[test]
    fn test_query_cards_with_date_format() {
        let _lock = acquire_test_lock();
        init_cache();

        // 1. Парсим запрос с date_format
        let parsed = crate::table_processing::parsing::parse_fsrs_table_block(
            "SELECT date_format(due, '%d.%m.%Y') AS \"Дата\", file, reps",
        )
        .unwrap();
        let params = parsed.value;

        // Первая колонка — date_format
        assert_eq!(params.columns.len(), 3);
        assert_eq!(params.columns[0].field, "due");
        assert_eq!(params.columns[0].date_format, Some("%d.%m.%Y".to_string()));
        assert_eq!(params.columns[0].title, "Дата");
        // Остальные без формата
        assert_eq!(params.columns[1].field, "file");
        assert_eq!(params.columns[1].date_format, None);
        assert_eq!(params.columns[2].field, "reps");
        assert_eq!(params.columns[2].date_format, None);

        // 2. Добавляем карточку в кэш
        let item = make_test_item("t_datefmt.md", 2, "2025-03-07T14:30:00Z");
        let input = serde_json::to_string(&vec![item]).unwrap();
        add_or_update_cards(&input);

        // 3. Запрашиваем через query_cards
        let params_json = serde_json::to_string(&params).unwrap();
        let result = query_cards(&params_json, "2025-03-08T12:00:00Z");
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        // 4. Проверяем результат
        assert_eq!(parsed["total_count"].as_u64().unwrap(), 1);
        let cards = parsed["cards"].as_array().unwrap();
        assert_eq!(cards.len(), 1);

        // computed_fields.due в Obsidian-формате — готов для TS wasmFieldsToState
        let due = cards[0]["computed_fields"]["due"].as_str().unwrap();
        assert!(due.starts_with("2025-03-07_"));
    }
}
