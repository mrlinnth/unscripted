# Phase 2: Project Scaffold

Goal: an empty Tauri v2 + React + TypeScript + Mantine app with Vitest and a
typecheck script, using the versions in `ai/CONSTRAINTS.md`.

## Task 2.1: Tauri App at Repo Root [DONE]

### Subtasks
- Scaffold in the scratchpad or a temp folder, not in the repo:
  `npm create tauri-app@latest unscripted -- --template react-ts`.
  `--template` is the only documented flag; answer prompts with npm as the
  package manager and identifier `dev.unscripted.game`. If the prompts cannot be
  answered from the agent shell, ask the developer to run the command with `!`.
- Copy the scaffold into the repo root: `package.json`, `index.html`,
  `vite.config.ts`, `tsconfig*.json`, `src/`, `src-tauri/`, `public/` (if any),
  and the template `.gitignore` entries (merge with the existing `.gitignore`).
  Do not touch `ai/` or `spikes/`.
- Set `productName` to `Unscripted` and window title to `Unscripted` in
  `src-tauri/tauri.conf.json`.
- Remove the template demo: the `greet` command in `src-tauri/src/lib.rs`, the
  greet form and logos in `src/App.tsx`, and unused assets.
- Remove `tauri-plugin-opener` (Rust crate, `@tauri-apps/plugin-opener` npm
  package, its `.plugin(...)` line, and its capability entry). It is not in
  CONSTRAINTS.
- Pin versions in `package.json` to CONSTRAINTS: `react` / `react-dom` 19.3,
  `@tauri-apps/api` 2.12, `@tauri-apps/cli` 2.12, `typescript` 7.0, `vite` 8.3,
  `@vitejs/plugin-react` 6.1. Use caret ranges on these minors.
- Pin `tauri` 2.12 and `tauri-build` 2.7 in `src-tauri/Cargo.toml`.
- Add `@mantine/core` and `@mantine/hooks` 9.7. Import
  `@mantine/core/styles.css` and wrap the app in `MantineProvider` in
  `src/main.tsx`. Skip Mantine's optional PostCSS setup (its packages are not in
  CONSTRAINTS).
- `src/App.tsx` shows a Mantine `Title` "Unscripted" only.
- Turn on TypeScript `strict` (keep it if the template has it) and add
  `"typecheck": "tsc --noEmit"` to `package.json` scripts (use `tsc -b --noEmit`
  style if the template uses project references; follow what the template does).
- If TypeScript 7.0 breaks the template's build or typecheck scripts, stop and
  report the error. Do not switch to 6.x without the developer's approval.
- Run `npm install` and commit `package-lock.json` and `src-tauri/Cargo.lock`.

### Key Files
- `package.json`
- `package-lock.json`
- `index.html`
- `vite.config.ts`
- `tsconfig.json` (and any `tsconfig.*.json` from the template)
- `src/main.tsx`
- `src/App.tsx`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- `src-tauri/src/main.rs`
- `src-tauri/capabilities/default.json`
- `.gitignore`

### Verification
- `npm run typecheck` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `npm run tauri dev` opens a window titled "Unscripted" with the Mantine title
  (developer checks by eye).
- `npm ls @tauri-apps/plugin-opener` shows nothing.

---

## Task 2.2: Vitest and Engine Folder

Depends on: Task 2.1

### Subtasks
- Add `vitest` 4.1 as a dev dependency. Add `"test": "vitest run"` to scripts.
- Configure Vitest in `vite.config.ts` (or a separate `vitest.config.ts` if the
  Tauri Vite config makes that awkward). Test environment: `node`.
- Create `src/engine/index.ts` exporting nothing yet but a placeholder comment.
- Add `src/engine/purity.test.ts`, a guard test that loads every non-test `.ts`
  file under `src/engine/` as raw text with Vite's
  `import.meta.glob(..., { query: '?raw', import: 'default', eager: true })`
  and fails if any contains: an import from `react`, `@mantine/`, or
  `@tauri-apps/`, or the text `Math.random`, `Date.now`, `new Date(`,
  `setTimeout`, or `setInterval`. This avoids needing `@types/node`.
- Make sure the guard test passes on the empty engine and fails if you
  temporarily add `Math.random()` to `src/engine/index.ts` (then remove it).

### Key Files
- `package.json`
- `vite.config.ts` (or `vitest.config.ts`)
- `src/engine/index.ts`
- `src/engine/purity.test.ts`

### Verification
`npm run typecheck && npm test` passes, and `cargo check --manifest-path src-tauri/Cargo.toml` passes.
