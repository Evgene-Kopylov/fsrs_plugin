# Agents.md — правила для FSRS Plugin

## Язык и локализация

Разработка ведется на русском языке. Интерфейсы для пользователя локализуются.
Всегда на русском языке
- коммиты
- документация
- комментарии в коде
- логи

## Процесс работы с задачами

В папке `docs/tasks/` лежат задачи. Каждая задача — отдельный файл.
Перед началом любых изменений **обязательно** прочитай `docs/tasks/index.md`.

Порядок работы над задачами:
1. Взять свободную задачу из `index.md` — отметить `[ ]` → `[>]` (в работе)
2. Выполнить задачу (код, тесты)
3. Сделать коммит и сообщить пользователю
4. Дождаться принятия коммита пользователем
5. Отметить задачу `[x]` (выполнена)
6. Взять следующую свободную задачу
7. Если задач в `index.md` нет — обновить его из папки `docs/tasks/`

## Документация

- **Все `.ru.md` файлы — приоритетные (source of truth).** Правки вносятся только в них.
- Файлы без `.ru` (например, `README.md`, `intended_use.md`) — автоматически генерируемые переводы. Они не редактируются вручную, а обновляются периодически на основе соответствующих `.ru.md` версий.
- Пример: `README.ru.md` → `README.md`, `intended_use.ru.md` → `intended_use.md`.

## 🚫 Запрещённые файлы (никогда не читать)

- `node_modules/` — npm зависимости, большой объём
- `wasm-lib/target/` — скомпилированные артефакты Rust
- `main.js` — сгенерированный бандл (очень большой, длинные строки)
- любые другие сгенерированные файлы

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
    Причины: 
    - агент не различает внешние зависимости и собственный WASM проекта.
    - Снжено доверие таким тестам.
- Пример: тесты для `fsrs-table-format.ts`, `date-format.ts`, `i18n.ts` и других pure-модулей.

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

**Принцип:** Rust — вычислительное ядро и менеджер кэша. TypeScript — тонкая обвязка для API Obsidian.

### Rust (WASM)

- **Хранит кэш карточек** — глобальный `Map<filePath, CachedCard>` внутри WASM (стабильность, сложность, состояние, история).
- **Инкрементально обновляет кэш** — получает от TS команды: добавить/обновить карточку, удалить карточку.
- **Выполняет все вычисления**:
  - FSRS-расчёты (состояние, следующий интервал, история).
  - Парсинг YAML/JSON.
  - Парсинг SQL-подобного синтаксиса для `fsrs-table`.
  - Фильтрацию (`WHERE`), сортировку (`ORDER BY`), ограничение (`LIMIT`).
- **Предоставляет быстрые запросы**:
  - `get_cards_count_for_query(params_json)` — количество карточек после WHERE (без сортировки/лимита).
  - `get_filtered_cards(params_json, limit, offset)` — JSON отфильтрованных, отсортированных, усечённых карточек с состояниями.
- **Stateless между вызовами?** Нет — кэш сохраняется между вызовами внутри одного экземпляра WASM (глобальная переменная). При выгрузке плагина кэш теряется — это нормально, так как TS запустит повторное сканирование.

### TypeScript

- **Файловая система** — читает markdown-файлы, извлекает frontmatter, передаёт в WASM.
- **Жизненный цикл и UI** — инициализация плагина, команды, настройки, рендеринг кнопок и таблиц.
- **Прогрессивное сканирование** — обходит файлы пачками (например, по 500), вызывает `add_or_update_card`. После каждой пачки проверяет `get_cards_count_for_query`, чтобы досрочно остановиться, если набрано достаточно карточек (например, 2 * LIMIT).
- **Рендеринг таблиц** — вызывает `get_filtered_cards` и отображает результат (без дополнительной сортировки/фильтрации).
- **События файловой системы** — при `modify`, `delete`, `rename` отправляет соответствующие команды в WASM для обновления кэша (с debounce).
- **Никакого кэширования состояний в TS** — TS не хранит карточки, не вычисляет состояния, не сортирует, не фильтрует.

### Что запрещено в TS

- Хранить кэш карточек (массивы, `Map` с `CachedCard`).
- Выполнять сортировку, фильтрацию, группировку карточек.
- Парсить YAML/JSON с карточками (всё делает Rust).
- Дублировать логику FSRS.

### Что запрещено в Rust

- Использовать API Obsidian (файловая система, UI, события) – это остаётся в TS.
- Предполагать, что кэш сохранится при перезагрузке плагина (он не должен).
- Блокировать поток выполнения (асинхронные операции в Rust не нужны, TS управляет асинхронностью).

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
