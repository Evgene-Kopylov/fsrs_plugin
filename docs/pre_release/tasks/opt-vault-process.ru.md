# Задача 7 (опционально): Замена Vault.modify на Vault.process

**Статус:** ❌ не выполнено

**Приоритет:** низкий (рекомендация Plugin guidelines, не блокирует релиз)

---

## Описание

Plugin guidelines рекомендуют `Vault.process` вместо `Vault.modify` для атомарных изменений файлов. `process` выполняет чтение-модификацию-запись атомарно, исключая конфликты с другими плагинами.

## Затронутые файлы

1. `src/commands/add-fsrs-fields.ts` — `app.vault.modify(activeFile, newContent)`
2. `src/commands/add-review-button.ts` — `app.vault.modify(activeFile, newContent)`
3. `src/commands/find-fsrs-cards.ts` — `plugin.app.vault.modify(activeFile, newContent)`
4. `src/commands/review/review-card.ts` — `app.vault.modify(file, newContent)`
5. `src/commands/review/delete-last-review.ts` — `app.vault.modify(file, newContent)`

## Шаблон замены

```ts
// Было:
await app.vault.modify(file, newContent);

// Стало:
await app.vault.process(file, (data) => {
  // вся логика модификации data переносится сюда
  return newContent;
});
```

## Сложность

Средняя. В каждом файле логика формирования `newContent` завязана на внешние переменные (YAML, фронтматер и т.д.). Потребуется рефакторинг — вынести мутацию строки в callback.