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
