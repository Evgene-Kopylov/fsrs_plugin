# Вывод записи из повторений

## Этап 1 — поле retired

- `types.rs` — `retired: bool` в `CardData`
- `yaml_parsing.rs` — `fsrs_retired` из YAML → `card.retired`
- `AVAILABLE_FIELDS` — `retired` в SELECT/WHERE/ORDER BY
- `query_cards` — умолчание `WHERE retired = 0`
- TS: интеграционный тест `fsrs-where-retired.test.ts`

## Этап 2 — команды и UI

- `toggle-retire.ts` — добавляет `fsrs_retired: true`, рескан, notifyRenderers
- `add-fsrs-fields.ts` — реактивация: убирает флаг, рескан
- `index.ts` — `retire-card`
- `main.ts` — `rescanFile`, `retired` из metadataCache
- `locales` — ru/en/zh
