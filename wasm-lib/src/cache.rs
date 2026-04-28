// Модуль кэша карточек FSRS
//
// Хранит глобальный `HashMap<String, CachedCard>` в памяти WASM.
// Все операции — через JSON для единообразия с остальными WASM-функциями.
//
// Используется из TypeScript как единый источник истины для состояний карточек.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::types::{ComputedState, ModernFsrsCard};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Структуры данных
// ---------------------------------------------------------------------------

/// Карточка, хранящаяся в кэше вместе с её вычисленным состоянием
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedCard {
    pub card: ModernFsrsCard,
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
            // Парсим карточку
            let card: ModernFsrsCard = match serde_json::from_str(&item.card_json) {
                Ok(c) => c,
                Err(e) => {
                    errors.push(format!(
                        "Ошибка парсинга card_json для '{}': {}",
                        item.file_path, e
                    ));
                    continue;
                }
            };

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

/// Возвращает карточку из кэша по пути (для использования внутри Rust).
pub fn get_cached_card(file_path: &str) -> Option<CachedCard> {
    let cache = global_cache();
    let map = cache.lock().unwrap();
    map.get(file_path).cloned()
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
        let card = ModernFsrsCard {
            reviews: vec![crate::types::ReviewSession {
                date: "2025-01-01T10:00:00Z".to_string(),
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
        let item = make_test_item("t_init_clear.md", 2, "2025-06-01T10:00:00Z");
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
            make_test_item("t_add_a.md", 2, "2025-06-01T10:00:00Z"),
            make_test_item("t_add_b.md", 3, "2025-06-05T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        let result = add_or_update_cards(&input);

        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["updated"].as_u64().unwrap(), 2);
        assert_eq!(get_cache_size(), 2);

        // Проверяем, что карточки действительно добавлены
        let cached = get_cached_card("t_add_a.md");
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().state.stability, 5.0);
    }

    #[test]
    fn test_update_existing() {
        let _lock = acquire_test_lock();
        init_cache();

        // Добавляем карточку
        let item = make_test_item("t_update_original.md", 2, "2025-06-01T10:00:00Z");
        let input = serde_json::to_string(&vec![item]).unwrap();
        add_or_update_cards(&input);
        assert_eq!(get_cache_size(), 1);

        // Обновляем ту же карточку с новыми данными
        let card = ModernFsrsCard {
            reviews: vec![
                crate::types::ReviewSession {
                    date: "2025-01-01T10:00:00Z".to_string(),
                    rating: 2,
                },
                crate::types::ReviewSession {
                    date: "2025-02-01T10:00:00Z".to_string(),
                    rating: 3,
                },
            ],
            file_path: Some("t_update_original.md".to_string()),
        };
        let state = ComputedState {
            due: "2025-07-01T10:00:00Z".to_string(),
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
        let cached = get_cached_card("t_update_original.md").unwrap();
        assert_eq!(cached.state.stability, 10.0);
        assert_eq!(cached.card.reviews.len(), 2);
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
        let item = make_test_item("t_remove_target.md", 2, "2025-06-01T10:00:00Z");
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
        let item = make_test_item("t_getall_1.md", 2, "2025-06-01T10:00:00Z");
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
        let good_item = make_test_item("t_mixed_good.md", 2, "2025-06-01T10:00:00Z");
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
            make_test_item("t_internal_a.md", 2, "2025-06-01T10:00:00Z"),
            make_test_item("t_internal_b.md", 3, "2025-06-05T10:00:00Z"),
        ];
        let input = serde_json::to_string(&items).unwrap();
        add_or_update_cards(&input);

        let all = get_all_cached_cards();
        assert_eq!(all.len(), 2);

        let paths: Vec<&str> = all.iter().map(|(p, _)| p.as_str()).collect();
        assert!(paths.contains(&"t_internal_a.md"));
        assert!(paths.contains(&"t_internal_b.md"));
    }
}
