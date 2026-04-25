# Предрелизная проверка — FSRS Plugin v0.4.6

Индексный файл. Каждая задача описана в отдельном файле в `tasks/`.

## Общий чек-лист

- [ ] **Задача 1** — Поднять `minAppVersion` в `manifest.json`
      → [tasks/fix-min-app-version.ru.md](tasks/fix-min-app-version.ru.md)
- [ ] **Задача 2** — Дополнить `versions.json`
      → [tasks/fix-versions-json.ru.md](tasks/fix-versions-json.ru.md)
- [ ] **Задача 3** — Версия в `README.md`
      → [tasks/fix-readme-version.ru.md](tasks/fix-readme-version.ru.md)
- [ ] **Задача 4** — Версия в `README.ru.md`
      → [tasks/fix-readme-ru-version.ru.md](tasks/fix-readme-ru-version.ru.md)
- [ ] **Задача 5** — Версия + language switcher в `docs/intended_use.md`
      → [tasks/fix-intended-use-version.ru.md](tasks/fix-intended-use-version.ru.md)
- [ ] **Задача 6** — Версия + language switcher в `docs/intended_use.ru.md`
      → [tasks/fix-intended-use-ru-version.ru.md](tasks/fix-intended-use-ru-version.ru.md)
- [ ] **Задача 7 (опционально)** — Замена `Vault.modify` на `Vault.process`
      → [tasks/opt-vault-process.ru.md](tasks/opt-vault-process.ru.md)

---

## Порядок выполнения

1. **Задачи 1–2** — конфигурация релиза (`manifest.json`, `versions.json`)
2. **Задачи 3–6** — синхронизация версии в документации (можно параллельно)
3. **Задача 7** — рефакторинг, если есть время (не блокирует релиз)

После выполнения — пересобрать плагин (`npm run build`) и создать GitHub release с тегом `0.4.6`.

## Порядок работ

- выполняешь задачу.
    - выполняешь проверки
        - cargo check
        - cargo test
        - cargo fmt
        - npm run test
        - npm run build
- отмечаешь выполнение в чек-листе
- делаешь коммит.
- переходишь к следующей доступной задче.
