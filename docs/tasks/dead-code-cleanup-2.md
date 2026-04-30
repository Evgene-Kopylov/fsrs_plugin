# Удаление мёртвого кода (вторая волна)

Удалить неиспользуемые функции:

**wasm-state.ts:**
- `getCardRetrievability` — не вызывается нигде

**fsrs-time.ts:**
- `describeCardState` — не вызывается
- `getOverdueHours` — только внутри мёртвой `describeCardState`
- `isCardOverdue` — не вызывается
- `getHoursUntilDue` — только внутри мёртвой `formatTimeUntilDue`
- `formatTimeUntilDue` — только внутри мёртвой `describeCardState`
- `getRussianNoun` — только внутри мёртвых функций
- `formatOverdueTime` — только внутри мёртвых (есть тесты — их тоже удалить)

**fsrs-frontmatter.ts:**
- `updateFrontmatterInContent` — не вызывается
- `removeFrontmatterFromContent` — не вызывается (есть тесты — удалить)

Убрать реэкспорты из index.ts.
