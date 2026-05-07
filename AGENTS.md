# Agents.md — правила для FSRS Plugin

## Язык и локализация

Разработка — на русском:
- коммиты (только заголовок)
- документация, комментарии, логи

UI локализуется.

## Процесс работы с задачами

Задачи — `docs/tasks/`, по файлу на задачу. Перед изменениями читать `docs/tasks/index.md`.

Порядок:
1. Взять свободную из `index.md`: `[ ]` → `[>]`
2. Выполнить (код, тесты)
3. Коммит → уведомить пользователя
4. Дождаться принятия коммита
5. Отметить `[x]`
6. Взять следующую
7. Если свободных нет — обновить `index.md` из `docs/tasks/`

## Документация

- **`.ru.md` — source of truth.** Правки только в них.
- Файлы без `.ru` — автопереводы. Не редактировать вручную. Обновляются из `.ru.md`.
- Пример: `README.ru.md` → `README.md`.

## 🚫 Запрещённые файлы (никогда не читать)

- `node_modules/` — npm зависимости, большой объём
- `wasm-lib/target/` — скомпилированные артефакты Rust
- `main.js` — сгенерированный бандл (очень большой, длинные строки)
- любые другие сгенерированные файлы

## Как увидеть консольный вывод Obsidian

- `tests/test_script/rebuild-log.sh` — скрипт сбора логов
- Скрипт: пересборка (`npm run build`), пауза для обновления Obsidian, сбор файлов и логов из тестового хранилища.
- Уровень логов в тестовом хранилище — Verbose (видны debug).
- Если не знаешь где, или логов нет → остановись, сообщи пользователю.

## Общие правила

- Неиспользуемые методы удалять без сожаления.
- Избегать равноправных вариантов → один способ делать что-либо.
- Без миграций данных.
- **Heredoc в shell запрещён.** Оболочка /bin/sh не поддерживает << EOF. Для многострочных скриптов использовать python3 -c, либо писать временный .py файл.
- до версии 1.0.0 обратная совместимость означает отображать ошибоку с причиной и вариантом решения, если что-то перестало работать.

## File editing rules (Zed + DeepSeek)

CRITICAL: When using `edit_file` tool:

- NEVER rewrite entire file. Do targeted SEARCH and REPLACE only.
- `old_text` must include 3-5 lines of surrounding code to ensure uniqueness.
- `new_text` identical to `old_text` except the exact change.
- No markdown code blocks, no extra text inside `new_text`.
- Multiple unrelated changes → separate `edit_file` calls.
- **`edits` передавать как JSON-строку, не как массив.** Иначе VecOrJsonString. Формат: `"edits": "[{\"old_text\": \"...\", \"new_text\": \"...\"}]"`

Example:

Task: change `const port = 3000;` to `const port = 8080;`

✅ Correct `old_text`:
```
const express = require('express');
const app = express();
const port = 3000;

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
```

✅ Correct `new_text`:
```
const express = require('express');
const app = express();
const port = 8080;

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
```

❌ Wrong: replacing whole file content.

Если edit_file или любая файловая операция завершается с ошибкой доступа, блокировки или похожей:

1. Сохранить файл и повторить
2. Не вышло — жди и пробуй (2с → 4с → 8с). После каждой попытки: «Файл выглядит заблокированным, повторяю через N секунд…»
3. Не вышло — выведи:
```text
ОШИБКА: Не удаётся получить доступ к <файл> после нескольких попыток.
Вероятно он заблокирован другим процессом.
Я прекращаю работу и жду разрешения ситуации.
```

### Несохранённые изменения в файлах
Unsaved changes → `save_file` → продолжай. Без спроса.

## 🔥 Строгое отношение к неиспользуемому коду

- Запрещён код «для обратной совместимости».
- Запрещён код «на всякий случай».
- Запрещены закомментированные неиспользуемые блоки.
- Запрещены неиспользуемые переменные, функции, импорты, экспорты, методы класса.
- Любой невыполняемый код удалить.
- Перед коммитом проверять мёртвый код (ESLint `no-unused-vars`, TS `noUnusedLocals`/`noUnusedParameters`).
- Временно не нужная функциональность → удалить (не комментировать). Восстановить из git.

## Project overview

- Target: Obsidian Community Plugin (TS → bundled JS).
- Entry: `main.ts` → `main.js`, loaded by Obsidian.
- Release artifacts: `main.js`, `manifest.json`, `styles.css` (optional).
- **Important:** DO NOT read `main.js`. Auto-generated, too big, long lines. Wastes context. Ignore.

## Environment & tooling

- Node.js: current LTS (18+ recommended).
- **Package manager: npm** (required – `package.json` defines scripts/deps).
- **Bundler: esbuild** (required – `esbuild.config.mjs` depends on it). Rollup/webpack acceptable if bundle all external deps into `main.js`.
- Types: `obsidian` definitions.

**Note**: This sample uses npm + esbuild. Different tools allowed, but replace build config accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- Install eslint: `npm install -g eslint`
- Run: `eslint main.ts`
- eslint → report with suggestions (file + line).
- For source in `src/`: `eslint ./src/`

## File & folder conventions

- **Organize into multiple files**: Split functionality, not everything in `main.ts`.
- Source in `src/`. `main.ts` small → plugin lifecycle (load, unload, register commands).
- **Example structure**:

  ```
  src/
    main.ts
    settings.ts
    commands/
    ui/
    utils/
    types.ts
  ```

- **Never commit build artifacts**: `node_modules/`, `main.js`, generated files.
- **Agent context**: use `.agentignore` (included) to exclude generated files.
- Keep plugin small. Avoid large deps. Prefer browser-compatible packages.
- Generated output → plugin root or `dist/`. Release artifacts at top level (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
  - `id` (plugin ID, matches folder name for local dev)
  - `name`, `version` (SemVer `x.y.z`), `minAppVersion`, `description`, `isDesktopOnly` (bool)
  - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Stable API.
- Keep `minAppVersion` accurate for newer APIs.
- Canonical validation: <https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml>

## Testing

- Manual test: copy `main.js`, `manifest.json`, `styles.css` (if any) to:

  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```

- Reload Obsidian, enable plugin in **Settings → Community plugins**.

## TS Unit testing

- Используйте Vitest (конфиг `vitest.config.ts`).
- **Запрещены моки** внешних зависимостей (Obsidian API, файловая система, WASM). Вместо моков — тестируйте изолированные чистые функции (утилиты, парсеры, преобразования).
    Причины: агент не различает внешние зависимости и собственный WASM проекта — снижено доверие к тестам.
- Пример: тесты для `fsrs-table-format.ts`, `date-format.ts`, `i18n.ts` и других pure-модулей.

## TS Интеграционные тесты (TS → WASM)

- Папка: `tests/integration/`.
- Тестируют связку: TypeScript → WASM (парсинг SQL, кэш, запросы, фильтрация, и любые другие обращения).
- **Сырой SQL.** Каждый тест содержит полное SQL-выражение строкой, без `replace`, без сборки из кусков:
- **Один файл — одно выражение.**
- Наполнение кэша — через хелперы из `tests/integration/helpers.ts` (`reviewCard`, `newCard`, `fillCache`).
- Минимум карточек в `beforeEach` — 2–3, чтобы тест был нагляден.
- **Наглядность и простота.** Одно сырое обращение на файл. Не дробить, не подставлять значения — повторять реальный сценарий. Тест без логики, без условий.
- **Запрещены** `it.skip`, `describe.skip`, условные выполнения (`if`) в теле теста.
- Подробные примеры — в `tests/integration/README.md`.

## Commands & settings

- User-facing commands via `this.addCommand(...)`.
- Config → settings tab + sensible defaults.
- Persist settings: `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming after release.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer). Update `versions.json` (plugin version → min app version).
- GitHub release: tag exactly matches `manifest.json` version (no leading `v`).
- Attach `manifest.json`, `main.js`, `styles.css` (if present) as individual assets.
- After initial release, follow community catalog process.

## Security, privacy, compliance

Follow Obsidian's **Developer Policies** + **Plugin Guidelines**:

- Default local/offline. Network only if essential.
- No hidden telemetry. Analytics/third-party → explicit opt-in, documented.
- No remote code, fetch/eval, or auto-update outside releases.
- Read/write only inside vault. No outside access.
- Disclose external services, data sent, risks.
- No vault contents, filenames, personal info without necessity + consent.
- No deceptive patterns, ads, spam.
- Use `register*` helpers for cleanup → safe unload.

## UX & copy guidelines

- Sentence case for headings, buttons, titles.
- Clear action-oriented imperatives.
- **Bold** for literal UI labels. Prefer "select".
- Arrow notation for navigation: **Settings → Community plugins**.
- Short, consistent strings, jargon-free.

## Performance

- Light startup. Lazy init.
- Batch disk access, avoid excessive vault scans.
- Debounce/throttle expensive ops on file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: lifecycle only. Delegate to separate modules.
- **Split large files**: >200-300 lines → smaller focused modules.
- **Single responsibility** per file.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs for mobile compat; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Разграничение ответственности Rust и TypeScript

**Принцип:** Rust — вычислительное ядро и менеджер кэша. TypeScript — тонкая обвязка для API Obsidian.

### Rust (WASM)

- **Хранит кэш карточек** — глобальный `Map<filePath, CachedCard>` внутри WASM.
- **Инкрементально обновляет кэш** — получает от TS команды: добавить/обновить/удалить карточку.
- **Выполняет все вычисления**: FSRS, парсинг YAML/JSON, парсинг SQL-синтаксиса для таблиц, фильтрацию (`WHERE`), сортировку (`ORDER BY`), лимит (`LIMIT`).
- **Предоставляет быстрые запросы**: `get_cards_count_for_query`, `get_filtered_cards`.
- **Stateless между вызовами?** Нет — кэш живёт в WASM между вызовами. При выгрузке плагина теряется — TS запустит повторное сканирование.

### TypeScript

- **Файловая система** — читает markdown, извлекает frontmatter, передаёт в WASM.
- **Жизненный цикл и UI** — инициализация, команды, настройки, рендеринг.
- **Рендеринг таблиц** — вызывает `get_filtered_cards` и отображает результат.
- **События FS** — при `modify`/`delete`/`rename` отправляет команды в WASM (с debounce).
- **Никакого кэширования** карточек в TS.

### Что запрещено в TS

- Хранить кэш карточек.
- Выполнять сортировку, фильтрацию, группировку.
- Парсить YAML/JSON с карточками.
- Дублировать логику FSRS.

### Что запрещено в Rust

- Использовать API Obsidian (ФС, UI, события).
- Предполагать, что кэш сохранится при перезагрузке плагина.
- Блокировать поток (асинхронность — в TS).

## Mobile

- Test on iOS + Android where feasible.
- Don't assume desktop-only unless `isDesktopOnly: true`.
- Avoid large in-memory structures; mindful of memory/storage.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename after release).
- Provide defaults + validation in settings.
- Idempotent code paths → reload/unload doesn't leak listeners/intervals.
- Use `this.register*` helpers for everything needing cleanup.
- **ОБЯЗАТЕЛЬНО** всю логику FSRS держать в Rust; TS только вызывает WASM и кэширует результаты.

**Don't**

- Network calls without obvious user-facing reason + docs.
- Features requiring cloud services without clear disclosure + explicit opt-in.
- Store/transmit vault contents unless essential + consented.
- **НЕЛЬЗЯ** писать в TS fallback-парсеры для Rust; доверять результату Rust.
- **НЕЛЬЗЯ** оставлять неиспользуемые функции в TS; удалять сразу.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal):

```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**:

```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**:

```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "Do something",
    callback: () => doSomething(plugin),
  });
}
```

### Add a command

```ts
this.addCommand({
  id: "your-command-id",
  name: "Do the thing",
  callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` + `manifest.json` at top level of `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: missing `main.js` → run `npm run build` or `npm run dev`.
- Commands not appearing: verify `addCommand` runs after `onload` + unique IDs.
- Settings not persisting: ensure `loadData`/`saveData` awaited + re-render UI after changes.
- Mobile-only issues: check no desktop-only APIs; adjust `isDesktopOnly`.

## References

- Obsidian sample plugin: <https://github.com/obsidianmd/obsidian-sample-plugin>
- API docs: <https://docs.obsidian.md>
- Developer policies: <https://docs.obsidian.md/Developer+policies>
- Plugin guidelines: <https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>
- Style guide: <https://help.obsidian.md/style-guide>
