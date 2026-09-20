# Phase 0 — Foundation

**Status:** complete
**Goal:** establish a trustworthy baseline before rebuilding anything.

---

## IMPLEMENTED

Phase 0 wrote almost no product code. Its job was to run the nine CI gates —
four of which had never executed anywhere — and repair what they found.

| Change                                                                 | File                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Preservation contract and its 43 assertions                            | `docs/PRESERVATION.md`, `packages/game-engine/test/preservation.test.ts` |
| Phase workflow and gate definitions                                    | `docs/WORKFLOW.md`                                                       |
| `engines: node >=22`; `verify` now runs the build it always claimed to | `package.json`                                                           |
| Lint ignores corrected; Node and ServiceWorker globals declared        | `eslint.config.js`                                                       |
| Prettier and git ignores aligned with the lint ignores                 | `.prettierignore`, `.gitignore`                                          |
| Test runner no longer walks the stale duplicate tree                   | `tools/run-tests.ts`                                                     |
| Windows spawn fix + honest error reporting                             | `tools/build-single-file.ts`                                             |
| Shim widened for `execFileSync`'s `shell` option                       | `types/node-minimal.d.ts`                                                |
| Draw-pile pulse no longer animates `transform`                         | `apps/client/src/styles/app.css`                                         |
| Seat/pile collision fixed, portrait and short landscape                | `apps/client/src/styles/app.css`                                         |
| Eight lint defects: unused imports, dead code, `let`→`const`           | various                                                                  |

---

## DOCUMENT

Satisfies TRD §11.4 (CI gates), TRD §12 (build targets) and `PRESERVATION.md`.

**What the work proved wrong in the documents:**

- **TRD risk R2 was wrong.** It predicted `typecheck:installed` would "find real problems" because the `types/` shims are narrower than the real definitions. It passed clean on the first run. The shims were tighter than `CHANGE_PLAN_2.md` assumed.
- **The test count in the specs was wrong twice.** The documents cite 212 from `CHANGE_PLAN_2.md`. The real untouched figure was 227 in isolation — and 258 on the development machine, because 31 of those came from a stale duplicate tree.
- **`ci.yml` was never missing gates.** It already ran all nine correctly. The gates had never run because the repository had never been pushed to GitHub. "CI needs the gates added" was wrong; "CI has never executed" was right.

---

## RULE IMPACT

**None.** No rule changed. Three edits touched frozen paths and all three are
non-behavioural:

```
packages/game-engine/src/deck.ts      let makeId → const makeId
packages/game-engine/src/reduce.ts    unused playerId → _playerId
packages/test-fixtures/src/index.ts   dropped unused index arg
```

No new rule flags. `RULE_FLAGS.md` unchanged, RF-001…RF-014 intact.

---

## TESTS

| Gate                        | Before           | After                                         |
| --------------------------- | ---------------- | --------------------------------------------- |
| `typecheck` (offline shims) | clean            | clean                                         |
| `typecheck:installed`       | never run        | clean                                         |
| `lint`                      | never run        | 2280 problems → **0**                         |
| `format:check`              | never run        | clean                                         |
| `test`                      | 258 (31 phantom) | **270 passed, 23 files**                      |
| `audit:brand`               | clean            | clean                                         |
| `build:web` / `build:pwa`   | never run        | pass — 31 files, 1.51 MB, 36 precached        |
| `build:single`              | never run        | **was broken on Windows**, now passes         |
| `test:e2e`                  | never run        | 6 failed → **0 failed, 72 passed, 3 skipped** |

New tests: 43 preservation assertions covering deck composition per ruleset,
the penalty vector, scoring, source constants, the stacking matrix, RF flag
defaults, WCAG contrast, the 7-card deal, card conservation, the manifest
contract and determinism.

---

## FINDINGS

Seven defects that were invisible before the gates ran.

1. **`build:single` was broken on Windows only.** `execFileSync('npm.cmd', …)` without `shell: true`; since the fix for CVE-2024-27980 Node refuses to spawn a `.cmd` through `execFile` and throws before the child starts. The catch block then reported "dependencies not installed" on a machine where they were. CI runs on `ubuntu-latest` where npm is not a `.cmd`, so CI would never have caught it — and this is the target that feeds the APK.

2. **31 phantom tests.** The runner walked `color-clash-fixed-sources/`, a stale duplicate of `apps/` and `packages/`, and ran its two test files against code that is never built, never imported, and has already drifted (`presentation.ts` 12,173b vs 12,165b; `Table.tsx` 25,221b vs 25,881b). Passing tests over dead code read as coverage.

3. **ESLint was linting a minified bundle.** `ignores: ['dist/**']` matches only the repository root; the web build emits to `apps/client/dist`. 2,199 of 2,280 reported problems were one file. Real source defects: 8.

4. **The draw pile could never be clicked by a test.** `.draw-pile.actionable` ran an infinite `transform` animation. A transform changes the client rect, so any actionability check waiting for a stable bounding box waits forever. The pulse only runs when the pile is actionable — exactly when something wants to click it. Now animates the ring only.

5. **Seats overlapped the piles on 9 of 12 viewports.** The browser suite tests three, so it read as two failures. Portrait: side seats pinned at `top: 50%`, the band the centred pile row occupies, at `z-index: 3` over the pile row's `2`. Short landscape: `.felt` was 144px tall containing a 166px `.pile-row` — the piles overflowed their own container before any seat was placed, and nothing scaled with viewport height.

6. **The first attempt at that fix was wrong in an instructive way.** A media query adds no specificity, and `.card.lg` is declared later in the stylesheet, so the card-shrink silently did nothing. The pile stayed 166px and the top seat ended at exactly the pile's top edge — a zero-pixel margin that passed on one machine and failed on another. The rules now live at the end of the file with a comment saying they must stay there.

7. **`verify` did not run a build** despite `DEVELOPMENT.md` saying it did, and no `engines` field was declared.

---

## KNOWN GAPS

- **`color-clash-fixed-sources/` still exists.** It caused three separate problems and is now suppressed in three config files. Suppression is not removal. Deleting it is the user's decision and has not been made.
- **UI/UX §9.1 is violated.** The document says "nothing blocks input — the command is queued, not dropped". The client disables controls during the paced presentation, so a tap mid-animation is lost. Recorded for Phase 7.
- **3 e2e tests skip** on the phone projects (the online specs are desktop-only). Expected, not investigated.
- **`dist/pwa` is not cleaned between builds** — stale hashed bundles from previous builds accumulate.
- **`npm run typecheck` (offline) has not been confirmed on the development machine.** It passes in an isolated environment against TypeScript 6.0.3; the repository pins 5.7.2.
- **The gates still run only locally.** The repository has not been pushed, so `ci.yml` has never executed.

---

## EXIT CRITERIA

| Criterion                    | Met                 |
| ---------------------------- | ------------------- |
| All nine gates execute       | yes                 |
| All nine gates pass          | yes                 |
| `preservation.test.ts` green | yes — 43 assertions |
| No rule changed              | yes                 |
