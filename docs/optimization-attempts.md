# Попытки оптимизации

В этом файле фиксируются попытки оптимизации, которые **не дали результата**, чтобы не повторять их в будущем.

## 1. Time-based yield при сканировании

В `performCacheScanAsync` добавлен yield по времени: каждые N итераций проверять `performance.now() - lastYieldTime` и если > 15ms — отдавать управление через `setTimeout`.

**Результат:** Не устранило violation `'setTimeout' handler took Nms`. Накладные расходы на `performance.now()` и `setTimeout` замедлили сканирование с ~3.3с до ~4.2с.

## 2. Yield по итерациям (50, 100, 200)

В `performCacheScanAsync` добавлен yield каждые N итераций (пробовали 50, 100, 200, 500).

**Результат:** Violation оставался (первые итерации до первого yield выполняются синхронно). Overhead от частых yield замедлял сканирование.

## 3. Кеширование `parametersToJson` в `computeCardState`

`prepareCommonArgs` вызывается для каждой карточки. `parametersToJson(settings.parameters)` сериализует одни и те же параметры 5000 раз. Добавлены опциональные `parametersJson` и `nowStr` в TS-функции, кеширование в `performCacheScanAsync`.

**Результат:** Выигрыш < 10ms на 5000 вызовов. `parametersToJson` и `now.toISOString()` настолько быстрые, что оверхед от условной логики перевешивает профит. Откачено.

## 4. Батчевый `computeCardsState` (первая версия)

Добавлена Rust-функция `compute_cards_state`, которая принимает JSON-массив карточек и возвращает JSON-массив состояний. На TS — `computeCardsState`, в `performCacheScanAsync` — один вызов на пачку.

**Первая версия Rust:** парсила массив в `Vec<serde_json::Value>`, для каждого элемента вызывала `compute_current_state` (которая парсит JSON заново). Двойная сериализация.

**Результат:** Сканирование не ускорилось (3.39 → 3.63 с) из-за двойной сериализации в Rust. Загрузка таблицы ускорилась (2.16 → 0.87 с), но это случайная вариативность — рендеринг таблицы не использует `computeCardsState`.

## 5. Батчевый `computeCardsState` (вторая версия, без двойной сериализации)

Та же идея, но в Rust выделена внутренняя функция `compute_card_state_inner`, работающая с уже распарсенными `ModernFsrsCard` и `FsrsParameters`. `compute_cards_state` парсит массив один раз и вызывает inner для каждой карточки без промежуточной сериализации.

**Результат:** Сканирование 3.30-3.32 с — без изменений относительно baseline (3.3 с). Bottleneck не в FFI/сериализации, а в 105k итерациях цикла по файлам (проверка metadataCache).

## 6. Чтение metadataCache из внутреннего Map вместо getFileCache

Вместо 105k вызовов `app.metadataCache.getFileCache(file)` — читать из `(app.metadataCache as any).metadataCache` (внутренний `Map<string, CachedMetadata>`).

**Результат:** Первая попытка — каст в `Map` (сломало). Вторая — каст в `Record`, доступ по `[file.path]` (105k без frontmatter). Третья — `Object.entries`, фильтр .md, итерация по entries (0 карточек). Внутренняя структура `metadataCache` не соответствует публичному API `getFileCache`. Откачено.

**Вывод:** Оптимизация через обход внутренней структуры metadataCache ненадёжна — формат ключей/значений может отличаться в разных версиях Obsidian.
