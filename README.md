# Worklog Tracker

A desktop app (Tauri 2 + React/TypeScript, Rust backend) that collects your activity for a period from **Jira**, **git**, **GitLab**, **Matrix**, **Confluence** and an **Exchange calendar**, and helps you prepare time entries for Jira Tempo and a weekly report.

The app builds a draft breakdown of hours per day and task from your events (optionally with the help of an AI model). You review and edit the draft and enter the time yourself; the app never submits anything.

**Read-only.** All connections only read data; nothing is written to Jira, GitLab, Matrix, Confluence or Exchange.

The UI is available in English and Russian.

## Getting started

Requirements: Node 18+, Rust (https://rustup.rs) and the Tauri v2 system prerequisites for your OS (https://v2.tauri.app/start/prerequisites/). Reading local repositories requires `git` on PATH.

```bash
npm install
npm run tauri dev      # development
npm run tauri build    # installer in src-tauri/target/release/bundle
npm test               # frontend tests
```

Rust tests: `cargo test` in `src-tauri/`.

### Windows build

- `npm run tauri build` produces an NSIS installer in `src-tauri/target/release/bundle/nsis/` and a portable `src-tauri/target/release/worklog-tracker.exe`. WebView2 is required (included in Windows 10/11).
- The `Build Windows installer` GitHub Actions workflow builds the installer on a Windows runner (manual run or a `vX.Y.Z` tag).
- The installer is not code-signed, so Windows SmartScreen may show a warning on first launch.
- Settings and tokens are stored per user (Windows Credential Manager and `%APPDATA%\dev.worklog.tracker`) and are not part of the build.

Linux: storing tokens requires Secret Service (gnome-keyring / KWallet); building requires `libdbus-1-dev`.

## Configuration (Settings screen)

| Service | What is needed |
|---|---|
| Jira Server/DC | URL and a Personal Access Token (Profile → Personal Access Tokens). Read access is enough. |
| AI (optional) | Base URL of an OpenAI-compatible API (without `/chat/completions`), model name, API key. |
| Confluence (optional) | URL and a Personal Access Token. Pages and comments you created or edited in the period are used as context. |
| Calendar (optional) | Exchange server address (e.g. `https://mail.company.com`), login (`DOMAIN\user` or `user@company.com`) and password. Read via EWS with Basic authentication; only the calendar is read. |
| GitLab (optional) | URL and a Personal Access Token with `read_api`. Merge requests you created, approved or commented on are read; by default only projects of your local repositories (matched by `git remote origin`). |
| Matrix (optional) | Homeserver, user ID and access token (or SSO login in the app). Rooms can be excluded from the list. |
| Git | Paths to local repositories; author email/name (defaults to `git config user.email`). |

Tokens are kept in the OS credential store (Windows Credential Manager / macOS Keychain / Secret Service), not in the settings file, and are never sent back to the UI. For services with self-signed certificates there is an option to skip TLS verification.

## How the draft is built

1. **Collect.** Jira: your status/field changes, comments and created issues. Git: your commits on all branches (with change size). GitLab: your merge request activity. Matrix: your messages in the selected rooms. Confluence: pages and comments you created or edited. Calendar: meetings (time, subject, organizer, location); cancelled, declined, free, all-day and over-10-hour items are skipped.
2. **Link to issues.** Issue keys like `ABC-123` are detected in commit messages, branch names, messages and room names. Keys that do not exist in Jira (e.g. `UTF-8`) are dropped.
3. **Analyse each day.** With AI enabled, the day's events (time, source, key, text truncated to 200 characters) and candidate issues (±3 days) are sent to the configured model, which returns relative task weights and a short summary of the day. Without AI, or if the request fails, a heuristic is used: Jira action ≈ 2, commit ≈ 1 + 1.5·log10(lines), message with a key ≈ 0.5.
4. **Hours.** Weights are converted into hours in 0.25 h steps according to your working-hours setting.
5. **Days without events.** Depending on the selected mode, such days are left empty or get a suggested split based on neighbouring days or the whole period. Suggested days are clearly marked in the UI and should be reviewed. Future days and non-working days are never filled.

### Issue context

For each issue, the description, parent, epic and linked issues (up to two levels up) are read as context for the AI; no hours are assigned to them. "Context-only" projects are configured in the Jira settings. With Confluence connected, pages referenced by the issue or its epic are read as well.

### Meetings

Meeting time is not subtracted from the working day. Meeting subjects are passed to the AI as context; a meeting whose subject contains an issue key adds a little weight to that issue. Meetings are listed under each day on the Hours tab and included in the per-day CSV, Markdown and copied text.

### Submit tab

Values ready to copy: hours (`2h 30m` or `2.5`) and a description per issue and day for Tempo, with "entered" marks; per week, text for the weekly report (can be rewritten by the AI). Hours can be edited, a day can be marked as a day off or vacation, and data can be exported as CSV and Markdown.

## What is sent to the AI

Commit messages, Jira comments, Confluence page excerpts, Matrix messages and meeting subjects (truncated), plus issue titles — only to the address configured in Settings. Individual sources, or AI analysis as a whole, can be turned off for a run.

## Public holidays

Settings → Working time: choose a country (RU, BY, KZ, UA, UZ, US). Holidays and moved days off are not filled, moved working Saturdays are, and pre-holiday days are one hour shorter (optional). Data comes from the public isdayoff.ru service (only dates and the country code are sent). If the service is unavailable, bundled files in `src-tauri/resources/holidays/<country>.json` are used.

## Project layout

- `src/` — frontend: `api.ts` (all Tauri calls), `types.ts`, `i18n/` (localization), `lib/` (pipeline, sources, analysis, hour planning, reports), `components/`, `styles/`.
- `src-tauri/src/` — backend: `commands/` (Tauri commands), `sources/` (API clients per service), `settings.rs`, `secrets.rs`, `error.rs`.

See `AGENTS.md` for details and contributor checklists.

## Auto-update

The app uses the Tauri updater. Updates are signed with your own key pair (no paid certificate needed) and distributed via GitHub Releases.

One-time setup:
1. `npm run tauri signer generate -- -w %USERPROFILE%\.tauri\worklog.key` — generates the key pair.
2. Put the public key (`worklog.key.pub`) into `src-tauri/tauri.release.conf.json` → `plugins.updater.pubkey`.
3. In the repository, Settings → Secrets and variables → Actions: add `TAURI_SIGNING_PRIVATE_KEY` (contents of `worklog.key`) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty if no password).

Each release:
1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` — the workflow builds, signs and publishes a release with `latest.json`.
3. Installed copies with the updater show an "update available" banner on launch.

The first version with the updater has to be installed manually. Keep the private key safe and out of the repository: without it, no updates can be issued for installed copies. The update endpoint is set in `tauri.release.conf.json` (`endpoints`); GitHub Releases of a private repository will not work as an update source.
