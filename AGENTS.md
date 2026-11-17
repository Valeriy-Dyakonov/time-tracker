# Worklog Tracker — notes for agents and contributors

Desktop app (Tauri 2 + React/TypeScript, Rust backend) that collects a person's activity (Jira, git, GitLab, Matrix, Confluence, Exchange calendar) for a period and turns it into hours per day/task for Jira Tempo and a weekly text report. The UI is localized (Russian and English); code, comments and commit messages are English.

## Commands

| What | Command (repo root unless noted) |
|---|---|
| Dev app | `npm run tauri dev` |
| Typecheck | `npx tsc --noEmit -p .` |
| Frontend tests | `npm test` (vitest, `src/lib/*.test.ts`) |
| Frontend build | `npx vite build` |
| Rust tests | `cargo test` in `src-tauri/` |
| Rust with updater | `cargo check --features updater` in `src-tauri/` |

On this Windows machine cargo is not on PATH in Git Bash: prefix with `PATH="$HOME/.cargo/bin:$PATH"`.
Before committing, run typecheck + `npm test` + `vite build`, and the Rust tests if `src-tauri` changed.

## Layout

### Frontend `src/`
- `api.ts` — the only place that calls Tauri `invoke`; one function per Rust command.
- `types.ts` — shared types (`Settings`, `Analysis`, `DayPlan`, `Evt`, `Evidence`...). `Settings` must mirror `src-tauri/src/settings.rs`.
- `theme.ts` — theme list, read/apply/persist (localStorage). The early apply script lives in `index.html`.
- `i18n/` — localization: `locale.ts` (current language, persisted, default from the OS), `format.ts` (plural forms, dates, hours), `index.ts` (`useT()` in components, `t()` elsewhere), `messages/{ru,en}/<namespace>.ts` (one file per area: common, shell, report, hours, submit, review, settings, analysis, errors).
- `lib/` — pure logic, no React:
  - `pipeline.ts` — `runAnalysis()`: orchestrates the stages only.
  - `sources/*.ts` — one `SourceCollector` per source (`sources/types.ts`); registered as steps in `analysis/steps.ts` (`COLLECT_STEPS`).
  - `analysis/` — run context and options, work calendar, issue enrichment, day allocators (`HeuristicAllocator` / `AiAllocator`), progress, period summary.
  - `plan/` — hour distribution, heuristic weights, task phase notes, gap fillers (`GapFiller` per fill mode), `buildPlan`.
  - `events/` — issue-key detection, grouping events by day, `toEvidence`.
  - `allocate.ts` — re-exports for old import paths; add new code to the modules above, not here.
  - `report.ts` (totals, CSV/Markdown), `submit.ts` (Tempo rows, weekly text), `prompt.ts` (LLM prompts), `setup.ts` (which sources are configured), `dates.ts`.
- `components/`:
  - `ui/` — UI kit: `kit.tsx` (Button, Card, Segmented, Switch, Badge), `basics.tsx` (Field, InfoTip, Help, Title, keyColor, download), `Copy.tsx`, `Stepper.tsx`; import from `components/ui`.
  - `report/` — report screen, filters, view tabs, export; `analysisSources.ts` is the registry of toggleable sources.
  - `hours/` — "Часы" tab: stats, overview, weeks, day accordion, by-task; shared helpers in `review.ts`.
  - `submit/` — "Списание" tab. `review/` — "Разбор ИИ" + evidence. `settings/` — settings screen.
  - `settings/registry.ts` — list of settings sections (nav + content); one component per section in `settings/sections/`.
  - `sources.ts` — source labels/order for display (single place, don't duplicate).
- `styles/` — all CSS, imported via `styles/index.css`: `tokens.css`, `themes.css`, `base.css`, `kit.css`, one file per screen. No hardcoded colors outside `tokens.css`/`themes.css`.

### Backend `src-tauri/src/`
- `lib.rs` — module list and `run()` (plugins, command registration) only.
- `error.rs` — `AppError { code, params }`: commands return codes, the frontend turns them into text (`api.ts` -> `errors` namespace). Never return user-facing prose from Rust errors.
- `texts.rs` — the few phrases that must be built in Rust (event descriptions read by the AI, room names, holiday names), per `Lang`; commands that need them take an optional `lang` that `api.ts` fills in.
- `commands/` — Tauri commands grouped by area; `commands/mod.rs` has `Ctx` (settings + HTTP client). `connection.rs` holds the per-service probe table for "Проверить подключение".
- `sources/` — API clients and parsers per service (`jira/`, `confluence/`, `matrix/`, `calendar/`, `gitlab.rs`, `gitlog.rs`, `holidays.rs`, `llm.rs`).
- `http.rs` — shared JSON GET with auth and error mapping; use it instead of hand-rolled requests.
- `model.rs` — `Event`, `IssueInfo`, `StatusChange`. `settings.rs` — `Settings` + settings.json I/O. `secrets.rs` — Windows Credential Manager via keyring; secret names are constants there.

## Checklists

**New data source** (e.g. another chat):
1. Rust: client/parser in `sources/<name>`, command in `commands/<area>.rs`, register in `lib.rs`, probe in `commands/connection.rs`, secret constant in `secrets.rs` if it needs a token, fields in `settings.rs`.
2. Frontend: fields in `types.ts` `Settings` (+ defaults), wrapper in `api.ts`, collector in `lib/sources/` + add to `COLLECT_STEPS`, `setup.ts` readiness, option flag in `analysis/types.ts` `RunOptions`, entry in `report/analysisSources.ts`, label in `components/sources.ts`, settings section in `settings/sections/` + `registry.ts`, source color token in `styles/tokens.css`.

**New setting**: `settings.rs` + `types.ts` (same camelCase name, default in both) + the settings section UI + its texts in `messages/{ru,en}/settings.ts`.

**New language**: add the id to `Locale`/`LOCALES` in `i18n/locale.ts`, tables in `i18n/format.ts`, a `messages/<lang>/` folder typed against `ru`, and a `Lang` variant in `src-tauri/src/texts.rs`.

**New theme**: tokens block in `styles/themes.css` (all color tokens incl. `--on-accent` and `color-scheme`) + entry in `theme.ts`.

**New UI element**: reuse `components/ui` first; styles go into the screen's file in `styles/`, shared patterns into `kit.css`.

## Contracts that must not break
- Tauri command names, arguments and returned JSON shapes (see `api.ts`).
- `settings.json` format and keyring entry names — existing users' settings and tokens must keep working.
- The `updater` cargo feature gates the updater plugin; release builds use `--features updater --config src-tauri/tauri.release.conf.json`.
- Version lives in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (+ lockfiles); a `vX.Y.Z` tag must match it and triggers the release workflow.

## Localization
- No user-visible string literals in components or `lib/`: add a key to the area's namespace in **both** `messages/ru` and `messages/en` (the en file is typed `typeof ru`, so a missing key fails the build). Parametrised text is a function; plural forms are declared with `forms({...})` and rendered with `plural`/`count`.
- Read messages at call time (`useT()` in components, `t()` in plain code), never at module load, so switching the language takes effect.
- Dates/hours on screen: `dateShort`, `dateFull`, `fmtH`; text copied into other systems (Tempo, CSV, weekly text): `formatDate` (ru `dd.mm.yyyy`, en ISO) and `fmtTempo`.
- AI prompts are per language (`analysis.prompt`); the AI answers in the UI language.
- Backend → frontend: errors are codes (`errors.codes`), event types are `Evt.kind`; never parse Rust-generated text on the frontend.

## Conventions
- UI text short and concrete. Anything whose purpose isn't obvious gets an `InfoTip` ("что это и зачем").
- Small focused modules; prefer a registry/strategy over a growing `switch`/`match`.
- Comments only for a non-obvious "why"; don't restate the code.
- All connections are read-only: the app never writes to Jira, GitLab, Matrix etc.
