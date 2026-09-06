# Color Clash

A multi-version digital card game: one deterministic engine, five isolated
ruleset modules, one shared UI shell, and a command/event boundary that local
play, online play, AI and tests all reuse.

```
Classic Clash · Flipstorm · Mayhem · Wild Rush · Freestyle
```

Every image, sound and card face in this project is its own — generated from
vector sources in `tools/gen-brand.ts` and synthesised at runtime respectively.
See `docs/BRANDING.md`.

## Quick start

```bash
npm install          # needed for the dev server and the builds; not for the tests
npm run typecheck    # tsc across every package, with no dependencies installed
npm test             # 212 tests: unit, property, integration, network, build packaging
npm run dev          # client on :5173
npm run dev:server   # authoritative match server on :8787
npm run test:e2e     # browser tests (needs `npm run build:pwa` first)
```

`docs/DEVELOPMENT.md` explains the two typecheck modes and the three build
targets, both of which are unusual here and both of which are deliberate.

No network? The typecheck and the whole test suite still work with nothing
installed — that is what the shims in `types/` and the runner in `tools/` are
for:

```bash
npx tsx tools/run-tests.ts            # full suite, no dependencies
npx tsx tools/link-workspaces.mjs     # if npm did not link the workspaces
```

The **builds** do need `npm install`: all three are Vite, including the
self-contained one. That is a deliberate trade — the single-file target used to
be dependency-free, built with `tsc --module system --outFile`, and those flags
are deprecated. Carrying a second bundler to preserve an offline build would
have meant the Android target breaking on a TypeScript upgrade while the web
target carried on.

### If `npm install` fails on `@colorclash/...`

npm's workspace resolution has behaved differently across major versions and
platforms. If `npm install` tries to fetch `@colorclash/ai` (or any `@colorclash/*` package)
from the registry and 404s, it has failed to link the local packages. Fix it
without npm:

```bash
npm run link          # node tools/link-workspaces.mjs
```

That creates the `node_modules/@colorclash/*` links directly (directory junctions on
Windows, so no elevated prompt is needed). Everything then works except the
Vite dev server, which needs its own dependencies:

```bash
npm test              # full suite
npm run dev:server    # match server, serves the built client
```

Internal packages are declared with explicit `file:` paths rather than `"*"`
ranges precisely so this resolution does not depend on npm's version.

## Repository layout (§4.1)

```
/apps
  /client            React UI, animation, local input, screens
  /server            Match rooms, WebSocket transport, authority
/packages
  /game-engine       Pure rules, state transitions, validators
  /game-content      Version manifests, card metadata, localization keys
  /ai                Bot strategies using legal-move queries
  /shared            Types, event schemas, utilities
  /test-fixtures     Deterministic decks and state snapshots
/docs
  MASTER_BLUEPRINT.md
  RULE_FLAGS.md      Every place the source is silent, and what we do instead
/tools               Test runner, asset generator, build packaging
```

### Dependency rules (§4.2)

- The UI imports engine types and command contracts but never mutates game state.
- The engine imports no React, DOM, browser or network code.
- The server owns authoritative state in online matches.
- Bots submit the same commands as human clients.
- Every ruleset registers through the `VersionManifest` interface.
- All randomisation takes an injectable seeded RNG.

These are structural, not conventions: `packages/game-engine` has no import of
anything outside `@colorclash/shared` and `@colorclash/game-content`.

## The engine contract

```ts
reduce(state, command, rng) => { state, events }
```

Pure. No clocks, no I/O, no globals. The same function backs local play, the
authoritative server, the bots and every test. A ruleset never mutates state
directly — it returns an ordered list of `Resolution` effects that the engine
applies, which is what keeps multi-effect cards (Wild Reverse Skip, Flex Draw
Two, Discard All) deterministic.

Invariants from §6.1 are asserted after **every** accepted command:

- every card exists in exactly one zone
- no player holds a duplicate `CardId`
- exactly one legal active player while `PLAYING`
- `activeColor` is always resolved once a wild settles
- recycling never moves the current top discard into the draw pile
- eliminated players can neither act nor be targeted
- no stale pending choice

## Rulesets

| Version | Deck | Distinctive mechanics |
| --- | --- | --- |
| Classic Clash | 108 | Skip, Reverse (2-player = Skip), Draw Two, Wild, Wild Draw Four |
| Flipstorm | 112 | Dual-side cards, Flip, Draw One/Five, Skip Everyone, Wild Draw Color |
| Mayhem | 168 | +2/+4/+6/+10 stacking, 25-card elimination, 7 swap, 0 rotate, Discard All |
| Wild Rush | 112 | Global target Draw Two, Double Skip (+3), all-wild legality |
| Freestyle | 108 | Primary/secondary matrix, public FlexPowerTracker, alternate effects |

Deck counts are asserted at generation time — a composition whose generated size
disagrees with its manifest is a build failure, not a subtle in-game bug.

**Read `docs/RULE_FLAGS.md` before changing any rule.** It records every place
the source blueprint is silent or self-inconsistent, what the default is, where
the switch lives and which test pins it. Nothing outside that ledger was
invented.

## Multiplayer (§10)

```
Client -> Command -> Server validates -> Engine reduce() -> Events
       -> Server broadcasts snapshot/delta -> Clients animate
```

`MatchRoom` is transport-agnostic and holds the only authoritative state, so
reconnect, duplicate-command and stale-sequence handling are unit-testable
without opening a port. Clients never decide legality; a replayed `commandId`
is acknowledged but applied once; commands are rate-limited; and a snapshot
contains only the recipient's own hand.

The WebSocket layer (`apps/server/src/websocket.ts`) is a small RFC 6455
implementation so the stack stays dependency-free. It is the only file that
speaks the wire protocol — swapping it for `ws` means replacing that module and
nothing else.

### Playing online

```bash
npm run build          # Vite -> apps/client/dist, which the server serves
npm run dev:server     # serves the client and the match server on :8787
```

Open `http://localhost:8787` on two devices on the same network (substitute the
host machine's LAN address on the second one). **ONLINE** → **CREATE ROOM**
gives the host a five-character code; the other player enters it under **JOIN
ROOM**. Both press *I'm ready*, then the host starts. Empty seats can be filled
with bots at any difficulty.

The client never decides legality — `view.legalCardIds` arrives already computed
by the authoritative engine, so a modified client cannot play an illegal card.

**Reconnect.** The player id is kept in `localStorage`, so a dropped connection
reconnects with backoff, rejoins the room and asks for a `RESYNC`; the server
returns a snapshot plus every missed event and the seat is held throughout. Any
command that was in flight when the socket died is replayed with its original
`commandId`, which the server's idempotency check resolves. A room whose players
have all dropped is held for 90 seconds before being reaped, so a brief blip
that disconnects everyone does not destroy a live match.

## Installing on a phone

### As an app

```bash
npm run build:pwa      # -> dist/pwa/
```

`dist/pwa/` is the web build plus a web manifest, an icon set cut from the same
key art, and a cache-first service worker that precaches exactly what was
emitted. Serve that folder over http(s) — any static host, or
`npm run dev:server`, or GitHub Pages — and Chrome offers **Install app**. It
then runs full-screen from the home screen with no network at all: everything
it needs is precached on install, and nothing is fetched at runtime.

The service worker never touches cross-origin requests and does not intercept
WebSockets, so online multiplayer is unaffected by the cache.

### As a real APK

Building an APK needs the Android SDK, a JDK and Gradle — impractical on a
phone. `.github/workflows/android-apk.yml` does it on GitHub's runners instead:

1. Push this repository to GitHub.
2. **Actions → Build Android APK → Run workflow.**
3. When it finishes, open the run and download the **color-clash-apk** artifact.

The workflow typechecks and runs the full test suite before it builds, wraps
`dist/pwa` with Capacitor, generates launcher icons and splash screens from
`resources/icon.png`, and assembles a debug APK. Capacitor is installed inside
the workflow rather than added to `package.json`, so the repository stays
dependency-free for anyone who does not want an APK.

The output is a *debug* APK: installable on any device with "install unknown
apps" enabled, but not signed for a store.

### Signed release for the Play Store

`.github/workflows/android-release.yml` builds a signed **AAB** (what Play
takes) and a matching signed **APK**, from four encrypted repository secrets
holding your keystore. It refuses to start if a secret is missing, and verifies
with `apksigner` and `jarsigner` that the outputs are genuinely signed rather
than assuming it.

**`docs/PUBLISHING.md` has the full walkthrough** — generating the keystore on
your own device, Play App Signing, version codes, target API levels and the
store-listing checklist. Read the warning at the top of it first: the supplied
artwork carries a third-party trademark, so the app needs its own name and art
before it can be published publicly (RF-014).

## AI (§11)

Bots receive a `PlayerView` — the exact structure a networked client receives —
and return one `Command`. There is no path from a bot to the authoritative
`GameState`, so difficulty can only improve decision quality, never create
invisible information. Tiers follow Table 12: Easy (random legal move), Normal
(sheds high-risk cards, basic penalty awareness), Hard (tracks hand sizes,
colours and the pending stack), Chaos (aggressive stacking, elimination
awareness, hand-swap optimisation).

## Testing (§16)

| Layer | Covered by |
| --- | --- |
| Unit | `deck`, `classic`, `flip`, `mayhem`, `allWild`, `flex`, `uno` |
| Property | `properties` — card conservation, no duplicates, reachability, determinism |
| Integration | full rounds per version, 2–10 players |
| Network | `apps/server/src/room.test.ts` — reconnect, duplicate, stale, late join, resync |
| Protocol | `apps/client/src/state/net.test.ts` — command stamping, acknowledgement, replay after a drop |
| Edge cases | `edgeCases` — the complete §16.2 list |

The runner is dependency-free (`tools/run-tests.ts`) and uses a
Vitest-compatible `describe`/`it`/`expect` subset, so the suite can be pointed at
Vitest or Jest later without rewriting a test.

## Art

Every image in the client is a crop of the single key-art sheet supplied with the
brief — sliced by `tools/gen-assets.ts` and inlined as data URIs. No artwork was
generated or substituted. Card faces are the one exception and are drawn in CSS,
because the sheet contains only a handful of faces at roughly 30×40 pixels;
their geometry and colour values are sampled from that same artwork.

See RF-014 in `docs/RULE_FLAGS.md` for the outstanding licensing checklist item.

## Accessibility (§12)

Non-colour cues on every outcome (glyph, text and `aria-label` on every card),
named colour swatches rather than bare dots, reduced-motion support honouring
both the OS setting and an in-app toggle, focus-visible outlines, live regions
for the event log, and large touch targets.
