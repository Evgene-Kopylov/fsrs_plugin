# Agents.md — правила для FSRS Plugin

## 🚫 Запрещённые файлы (никогда не читать)

- `node_modules/` — npm зависимости, большой объём
- `wasm-lib/target/` — скомпилированные артефакты Rust
- `main.js` — сгенерированный бандл (очень большой, длинные строки)
- любые другие сгенерированные файлы

## File editing rules (Zed + DeepSeek)

CRITICAL: When using `edit_file` tool:

- NEVER rewrite entire file. Do targeted SEARCH and REPLACE only.
- `old_string` must include 3-5 lines of surrounding code to ensure uniqueness.
- `new_string` identical to `old_string` except the exact change.
- No markdown code blocks, no extra text like "Here is the updated code" inside `new_string`.
- Multiple unrelated changes → separate `edit_file` calls.

Example:

Task: change `const port = 3000;` to `const port = 8080;`

✅ Correct `old_string`:
```
const express = require('express');
const app = express();
const port = 3000;

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
```

✅ Correct `new_string`:
```
const express = require('express');
const app = express();
const port = 8080;

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
```

❌ Wrong: replacing whole file content.


## Язык

- Пиши и рассуждай по-русски.
- Сообщения коммитов по-русски.
- Логи ошибок по-русски.
- Не переводи логи и комментарии (оставляй как есть).

## Документация проекта

- `docs/PROJECT_STRUCTURE.md`
- `docs/DATA_MODEL.md`
- `docs/FSRS_DEV_PLAN.md`
- `docs/FSRS_USAGE.md`

## Как увидеть консольный вывод Obsidian

- `tests/test_script/rebuild-log.sh` — скрипт сбора логов
- Скрипт: пересборка (`npm run build`), пауза для обновления Obsidian, сбор файлов и логов из тестового хранилища.
- Уровень логов в тестовом хранилище — Verbose (видны debug).
- Если логов нет → остановись, сообщи пользователю.

## Общие правила

- Неиспользуемые методы удалять без сожаления.
- Избегать равноправных вариантов → один способ делать что-либо.
- Без миграций данных.
- Обратная совместимость не важна.

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
- Canonical validation: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual test: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
  ```
  <Vault>/.obsidian/plugins/<plugin-id>/
  ```
- Reload Obsidian, enable plugin in **Settings → Community plugins**.

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

- Default to local/offline. Network only if essential.
- No hidden telemetry. Optional analytics/third-party → explicit opt-in, document in `README.md` + settings.
- Never remote code, fetch/eval scripts, or auto-update outside normal releases.
- Minimize scope: read/write only what's necessary inside vault. No outside vault access.
- Disclose external services, data sent, risks.
- Respect privacy. No vault contents, filenames, personal info unless essential + explicit consent.
- No deceptive patterns, ads, spammy notifications.
- Register & clean up DOM, app, interval listeners with `register*` helpers → safe unload.

## UX & copy guidelines

- Sentence case for headings, buttons, titles.
- Clear action-oriented imperatives.
- **Bold** for literal UI labels. Prefer "select".
- Arrow notation for navigation: **Settings → Community plugins**.
- Short, consistent strings, jargon-free.

## Performance

- Light startup. Defer heavy work.
- Avoid long-running tasks in `onload`. Lazy init.
- Batch disk access, avoid excessive vault scans.
- Debounce/throttle expensive ops on file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: lifecycle only (onload, onunload, addCommand). Delegate feature logic to separate modules.
- **Split large files**: >200-300 lines → break into smaller focused modules.
- **Clear module boundaries**: single responsibility per file.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs for mobile compat; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Разграничение ответственности Rust и TypeScript

**Принцип:** Rust — вычислительное ядро, TypeScript — тонкая обвязка для API Obsidian.

- **Вся сложная логика в Rust** – расчёты FSRS, парсинг YAML, парсинг SQL, фильтрация, сортировка. Вызовы WASM быстры, но минимизируем их количество за счёт пакетной передачи данных.
- **TypeScript только для** – жизненного цикла плагина, UI настроек, событий файловой системы, кэширования, рендеринга, уведомлений пользователя.
- **Никаких fallback-парсеров в TS** – если Rust вернул ошибку, карточка считается битой. Не дублируем логику парсинга YAML/JSON.
- **Кэш состояний в TS** – храним `{ card, state }` после того, как Rust один раз вычислил состояние. При фильтрации/сортировке используем готовые состояния, не вызывая Rust повторно.
- **Нет кода «на всякий случай»** – каждая функция в TS должна использоваться. Неиспользуемый код удалять сразу.
- **Единый источник истины** – модель данных и алгоритмы в Rust. TS передаёт только сериализуемые данные (JSON) в WASM и обратно.

**Что запрещено в TS:**
- Переписывать логику Rust (парсинг, работу с датами, формулы FSRS).
- Вызывать Rust для каждой карточки по отдельности, если можно пакетно.
- Хранить мёртвый код «для обратной совместимости».

**Что запрещено в Rust:**
- Использовать API Obsidian (файловая система, UI, события) – это остаётся в TS.
- Хранить состояние между вызовами – Rust-функции stateless, кэшированием занимается TS.

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

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API docs: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide
