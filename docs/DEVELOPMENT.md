# Development

Two things about this repository are unusual and worth reading before you
change anything: it has **two typecheck modes**, and it has **three build
targets** that deliberately do not share a bundler.

---

## Quick start

```bash
npm install
npm run verify          # typecheck + tests + branding audit + a build
npm run dev             # client on :5173
npm run dev:server      # match server on :8787
```

If `npm install` fails on the workspace packages — some npm versions resolve
`file:` links inconsistently on Windows — run `npm run link`, which creates the
same links directly.

---

## Typechecking: two modes, both real

| Command | Config | What it proves |
| --- | --- | --- |
| `npm run typecheck` | `tsconfig.json` | The tree compiles with **no dependencies at all**, using the hand-written shims in `types/` |
| `npm run typecheck:installed` | `tsconfig.installed.json` | The tree compiles against the **real** `@types/node`, `@types/react` and `vite/client` |

The shims exist because this project must be checkable and testable on a
machine with no registry access, which is a genuine constraint on it. They are
narrow, and being narrow they will accept some code the real definitions would
reject — so the installed check is the authoritative one, and CI runs both.

**If you add a Node or DOM API**, the offline check is the one that will fail
first, and the fix is to add the declaration you need to `types/node-minimal.d.ts`.
Keep it minimal: the file is a list of what this repository actually uses, not
an attempt at a second `@types/node`.

---

## Build targets

Three outputs, **one bundler**.

| Command | Output | For |
| --- | --- | --- |
| `npm run build:web` | `apps/client/dist` | The web. Real image files, hashed and cacheable |
| `npm run build:pwa` | `dist/pwa` | Installable app, and the Android wrapper's web assets |
| `npm run build:single` | `dist/color-clash.html` | One self-contained, offline-capable document |

All three are Vite. `build:pwa` runs `build:web` and adds a manifest, an icon
set and a service worker; `build:single` runs the same project through
`apps/client/vite.single.config.ts` — the inlined asset registry, one chunk,
nothing emitted separately — and folds that chunk into the document.

**This used to be split**, and the split was a liability. The single-document
and Android targets were produced by `tsc --module system --outFile` behind a
hand-written module loader, with React from a CDN and a second script to inline
it. Those compiler flags are deprecated and were only surviving on
`ignoreDeprecations`, so the day TypeScript removed them the Android build
would have broken while the web build carried on — a failure discovered on
release day. There is now nothing to discover: one configuration produces
everything, and CI builds all three on every push.

**The APK ships real files.** It used to ship one 1.47 MB document with React
and 41 base64 images inside it, all of which had to be parsed on every cold
start and none of which could be cached separately. `dist/pwa` is now the
ordinary web build, so the WebView caches each file and fetches them in
parallel. Nothing is fetched at runtime, so it is still fully offline.

### Two asset registries

`tools/gen-assets.ts` writes two registries from the same images:

- `assets.gen.ts` — every image as a data URI. Used by `build:single`, which
  cannot fetch anything.
- `assets.files.ts` — every image as a file import. Used by the web and PWA
  builds, through a Vite alias, so the browser can cache each one separately.

Both export the same `AssetName` union and the same `ASSETS` shape, so nothing
above the registry knows which one it is talking to.

The images themselves are generated: `npm run brand` redraws all of them from
the vector sources in `tools/gen-brand.ts`, then regenerates both registries.
See `docs/BRANDING.md`.

---

## Tests

| Command | What |
| --- | --- |
| `npm test` | Engine, rulesets, server room, network protocol. No browser, no network |
| `npm run test:e2e` | Playwright, against the built PWA served over http |
| `npm run audit:brand` | Fails if the previous trademark reappears anywhere shippable |

The unit suite has its own runner (`tools/run-tests.ts`) for the same reason
the shims exist: it has to work with nothing installed.

The browser suite needs a build first:

```bash
npm run build:pwa && npm run test:e2e
```

It runs at three viewports — phone portrait, phone landscape, desktop — because
every layout bug this project has shipped was size-dependent. The multiplayer
specs run on desktop only, and spawn a real match server.

---

## The server

```bash
npm run dev:server
```

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `8787` | |
| `CLASH_TURN_TIMEOUT_MS` | `30000` | Time a player has before the server plays a legal move for them. `0` disables |
| `CLASH_BOT_DELAY_MS` | `700` | Gap between visible bot moves; also the yield that keeps one room's bots off another room's back |
| `CLASH_DATA_DIR` | `data/rooms` | Where live matches are persisted |

**Persistence** is one JSON file per room holding a seed and the accepted
command log — not the board. The engine is a deterministic reducer, so replaying
those inputs rebuilds the match exactly, and a saved file can never disagree
with the code that reads it. On boot the server replays whatever it finds.

**Timing** goes through the `Timers` interface in `apps/server/src/timers.ts`
rather than `setTimeout` directly. The default implementation runs callbacks
inline, which is what keeps the room tests synchronous; production passes
`REAL_TIMERS`; tests that care about time pass `FakeTimers` and advance the
clock by hand.

---

## Things that will bite you

**Type imports use `import type`.** `verbatimModuleSyntax` is on, so a type
brought in through a value import is an error rather than a mystery at build
time:

```ts
import { useState } from 'react';
import type { MouseEvent } from 'react';
```

(There used to be a stricter version of this rule — the two had to be on
separate lines, because the old single-file build textually rewrote value
imports of `react` into a destructure off a UMD global. That build is gone;
Vite has no such constraint.)

**`assets.gen.ts` is generated and enormous.** It is excluded from Prettier,
ESLint and the branding audit. Never edit it; run `npm run assets`.

**The engine must stay pure.** No clocks, no I/O, no globals in
`packages/game-engine`. The pacing and timer work above lives in the client and
the server precisely so the reducer stayed a reducer — which is what makes
replay, persistence and the deterministic tests possible.
