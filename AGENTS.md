# SKILLS.md
---
name: caveman
description: >
  Ultra-compressed communication mode. Cuts token usage ~75% by speaking like caveman
  while keeping full technical accuracy. Supports intensity levels: lite, full (default), ultra,
  wenyan-lite, wenyan-full, wenyan-ultra.
  Use when user says "caveman mode", "talk like caveman", "use caveman", "less tokens",
  "be brief", or invokes /caveman. Also auto-triggers when token efficiency is requested.
---

Respond terse like smart caveman. All technical substance stay. Only fluff die.

## Persistence

ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. Off only: "stop caveman" / "normal mode".

Default: **full**. Switch: `/caveman lite|full|ultra`.

## Rules

Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact.

Pattern: `[thing] [action] [reason]. [next step].`

Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"

## Intensity

| Level | What change |
|-------|------------|
| **lite** | No filler/hedging. Keep articles + full sentences. Professional but tight |
| **full** | Drop articles, fragments OK, short synonyms. Classic caveman |
| **ultra** | Abbreviate (DB/auth/config/req/res/fn/impl), strip conjunctions, arrows for causality (X → Y), one word when one word enough |
| **wenyan-lite** | Semi-classical. Drop filler/hedging but keep grammar structure, classical register |
| **wenyan-full** | Maximum classical terseness. Fully 文言文. 80-90% character reduction. Classical sentence patterns, verbs precede objects, subjects often omitted, classical particles (之/乃/為/其) |
| **wenyan-ultra** | Extreme abbreviation while keeping classical Chinese feel. Maximum compression, ultra terse |

Example — "Why React component re-render?"
- lite: "Your component re-renders because you create a new object reference each render. Wrap it in `useMemo`."
- full: "New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`."
- ultra: "Inline obj prop → new ref → re-render. `useMemo`."
- wenyan-lite: "組件頻重繪，以每繪新生對象參照故。以 useMemo 包之。"
- wenyan-full: "物出新參照，致重繪。useMemo .Wrap之。"
- wenyan-ultra: "新參照→重繪。useMemo Wrap。"

Example — "Explain database connection pooling."
- lite: "Connection pooling reuses open connections instead of creating new ones per request. Avoids repeated handshake overhead."
- full: "Pool reuse open DB connections. No new connection per request. Skip handshake overhead."
- ultra: "Pool = reuse DB conn. Skip handshake → fast under load."
- wenyan-full: "池reuse open connection。不每req新開。skip handshake overhead。"
- wenyan-ultra: "池reuse conn。skip handshake → fast。"

## Auto-Clarity

Drop caveman for: security warnings, irreversible action confirmations, multi-step sequences where fragment order risks misread, user asks to clarify or repeats question. Resume caveman after clear part done.

Example — destructive op:
> **Warning:** This will permanently delete all rows in the `users` table and cannot be undone.
> ```sql
> DROP TABLE users;
> ```
> Caveman resume. Verify backup exist first.

## Boundaries

Code/commits/PRs: write normal. "stop caveman" or "normal mode": revert. Level persist until changed or session end.

---
name: caveman-compress
description: >
  Compress natural language memory files (CLAUDE.md, todos, preferences) into caveman format
  to save input tokens. Preserves all technical substance, code, URLs, and structure.
  Compressed version overwrites the original file. Human-readable backup saved as FILE.original.md.
  Trigger: /caveman:compress <filepath> or "compress memory file"
---

# Caveman Compress

## Purpose

Compress natural language files (CLAUDE.md, todos, preferences) into caveman-speak to reduce input tokens. Compressed version overwrites original. Human-readable backup saved as `<filename>.original.md`.

## Trigger

`/caveman:compress <filepath>` or when user asks to compress a memory file.

## Process

1. Сжатие выполняет суб-агент.

2. Передай суб-агенту:
   - абсолютный путь к файлу
   - команду «сжать в caveman-формат»

3. Суб-агент:
   - определяет тип файла (без подсчёта токенов)
   - производит сжатие
   - проверяет результат
   - при ошибках: точечно исправляет (только ошибки, без полного пересжатия)
   - повторяет до 2 раз

4. Если после 2 попыток ошибка осталась → сообщи пользователю, исходный файл не трогай.

5. Верни результат работы суб-агента.

## Compression Rules

### Remove
- Articles: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to", "I'd recommend"
- Hedging: "it might be worth", "you could consider", "it would be good to"
- Redundant phrasing: "in order to" → "to", "make sure to" → "ensure", "the reason is because" → "because"
- Connective fluff: "however", "furthermore", "additionally", "in addition"

### Preserve EXACTLY (never modify)
- Code blocks (fenced ``` and indented)
- Inline code (`backtick content`)
- URLs and links (full URLs, markdown links)
- File paths (`/src/components/...`, `./config.yaml`)
- Commands (`npm install`, `git commit`, `docker build`)
- Technical terms (library names, API names, protocols, algorithms)
- Proper nouns (project names, people, companies)
- Dates, version numbers, numeric values
- Environment variables (`$HOME`, `NODE_ENV`)

### Preserve Structure
- All markdown headings (keep exact heading text, compress body below)
- Bullet point hierarchy (keep nesting level)
- Numbered lists (keep numbering)
- Tables (compress cell text, keep structure)
- Frontmatter/YAML headers in markdown files

### Compress
- Use short synonyms: "big" not "extensive", "fix" not "implement a solution for", "use" not "utilize"
- Fragments OK: "Run tests before commit" not "You should always run tests before committing"
- Drop "you should", "make sure to", "remember to" — just state the action
- Merge redundant bullets that say the same thing differently
- Keep one example where multiple examples show the same pattern

CRITICAL RULE:
Anything inside ``` ... ``` must be copied EXACTLY.
Do not:
- remove comments
- remove spacing
- reorder lines
- shorten commands
- simplify anything

Inline code (`...`) must be preserved EXACTLY.
Do not modify anything inside backticks.

If file contains code blocks:
- Treat code blocks as read-only regions
- Only compress text outside them
- Do not merge sections around code

## Pattern

Original:
> You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.

Compressed:
> Run tests before push to main. Catch bugs early, prevent broken prod deploys.

Original:
> The application uses a microservices architecture with the following components. The API gateway handles all incoming requests and routes them to the appropriate service. The authentication service is responsible for managing user sessions and JWT tokens.

Compressed:
> Microservices architecture. API gateway route all requests to services. Auth service manage user sessions + JWT tokens.

## Boundaries

- ONLY compress natural language files (.md, .txt, extensionless)
- NEVER modify: .py, .js, .ts, .json, .yaml, .yml, .toml, .env, .lock, .css, .html, .xml, .sql, .sh
- If file has mixed content (prose + code), compress ONLY the prose sections
- If unsure whether something is code or prose, leave it unchanged
- Original file is backed up as FILE.original.md before overwriting
- Never compress FILE.original.md (skip it)

# Agents.md — правила для FSRS Plugin

## 🚫 Запрещённые файлы (никогда не читать)

- `node_modules/` — npm зависимости, большой объём
- `wasm-lib/target/` — скомпилированные артефакты Rust
- `main.js` — сгенерированный бандл (очень большой, длинные строки)
- любые другие сгенерированные файлы

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

**Don't**
- Network calls without obvious user-facing reason + docs.
- Features requiring cloud services without clear disclosure + explicit opt-in.
- Store/transmit vault contents unless essential + consented.

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
