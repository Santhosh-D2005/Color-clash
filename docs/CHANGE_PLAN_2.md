# Change plan 2 — second playtest and code review remediation

The first pass rebranded the game and fixed 31 items. This one fixes the 24
findings from the playtest and code review of the result.

The governing constraint is the brief's own, quoted exactly:

> This is a surgical bug-fixing pass. If something is already working, LEAVE IT
> ALONE.

So every row below names the existing implementation that was changed and the
smallest change that closes the finding. Nothing was refactored on the way
past. The engine reducer, the five rulesets, the protocol, the bot logic, the
scoring outcomes, the visual design and the economy values are all untouched
except where a numbered finding required it.

---

## What each finding changed

| #   | Finding                                                         | Change                                                                                   | Proof                                               |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | The match clock counts up and means nothing                     | The header slot now shows cards left in the draw pile, labelled                          | `e2e/app.spec.ts` — "the header number is the deck" |
| 2   | Being eliminated looks exactly like winning                     | Result screen has three tones; confetti and crown only when won                          | `e2e/play.spec.ts` — summary spec                   |
| 3   | The standings order looks like a sorting bug                    | Each row leads with points, the value the list is actually ordered by                    | `Result.tsx` `scoreLine`                            |
| 4   | The match total is a running total that never runs              | Removed. Chained rounds do not exist yet, so neither does the number                     | `Result.tsx` `subLine`                              |
| 5   | Wild Rush is the flattest mode to watch                         | Action banners for the Wild Rush card kinds, from existing events                        | `presentation.test.ts` (16 tests)                   |
| 6   | No way to see play direction in landscape                       | Direction arrow moved into the turn chip, which landscape keeps                          | `e2e/app.spec.ts` — "play direction is readable"    |
| 7   | Emote bubbles inconsistent, one falls off screen                | Bubbles take a side and are placed from it                                               | `EmoteBubble` `side`                                |
| 8   | The turn timer sits on top of the turn chip                     | Timer rendered inside the chip instead of over it                                        | `Table.tsx` `TurnChip`                              |
| 9   | The Clash window is about three quarters of a second            | `clashGraceMs` — declared but never read — is now the floor on the pace                  | `pacing.test.ts`, `useGame.stepDelay`               |
| 10  | Coins do not survive closing the app, and a screen says they do | Profile persisted to the same store the sound preference uses                            | `e2e/profile.spec.ts` — currency spec               |
| 11  | Everyone online is called PlayerOne                             | One first-run name prompt, stored                                                        | `e2e/profile.spec.ts`, `e2e/online.spec.ts`         |
| 12  | Two lobby controls cannot be tapped on a phone                  | The lobby body scrolls instead of compressing its rows                                   | Browser suite at phone-portrait                     |
| 13  | Backgrounding the app loses the match                           | Seed + command log saved on every accepted command; menu offers Resume                   | `e2e/profile.spec.ts` — resume and discard          |
| 14  | Three config fields declared, defaulted, never read             | Two removed, one (`clashGraceMs`) implemented — see #9                                   | `types.ts`, unit suite                              |
| 15  | Two sound settings, the older one fake                          | One preference with a listener; both screens read and write it                           | `e2e/play.spec.ts` — sound persists                 |
| 16  | A replayed match is not byte-identical                          | Timestamps documented as runtime metadata and excluded explicitly                        | `determinism.test.ts` (4 tests)                     |
| 17  | Three sources disagree about player limits                      | One `limits.ts`: rule limit 2–10, seat limit 2–6, everything reads it                    | Unit suite across 2–10 players                      |
| 18  | The audio context is never resumed                              | `suspended` resumes, `closed` recreates, on the next cue                                 | `audio.ts`                                          |
| 19  | The new client logic has no unit tests                          | `presentation.test.ts` and `pacing.test.ts`; `pacing.ts` extracted so they need no React | 20 new tests                                        |
| 20  | The command log grows without bound                             | Checkpoint every 40 commands; the log folds into it                                      | `persistence.test.ts` — checkpoint specs            |
| 21  | Every saved room is resurrected on boot                         | Boot restores only rooms saved in the last two minutes                                   | `store.ts` `RESTORE_MAX_AGE_MS`                     |
| 22  | The single-file build rests on deprecated compiler flags        | One bundler. See below                                                                   | CI builds all three targets                         |
| 23  | The offline build is one 1.47 MB document                       | The APK ships real files; the splash ends when loading does                              | See below                                           |
| 24  | Four quality gates have never run anywhere                      | Cannot be fixed from here. See below                                                     | —                                                   |

---

## 22 and 23 in full, because they changed the build

**One bundler.** `tsc --module system --outFile` plus a hand-written module
loader, a CDN copy of React and a second script to inline it are all gone.
`apps/client/vite.single.config.ts` is the web configuration with the inlined
asset registry and one chunk; `tools/build-single-file.ts` folds that chunk
into the document and is now thirty lines. `tools/build-offline.mjs` is
deleted — a Vite build already bundles React, so the single-file build _is_ the
offline build. `ignoreDeprecations` is gone from `tsconfig.json`, and there is
no longer a `.build/tsconfig.build.json` to carry it.

**The APK ships real files.** `dist/pwa` is now the ordinary web build plus a
manifest, icons and a service worker, instead of one 1.47 MB document with 41
base64 images in it. The worker precaches the list of files that were actually
emitted rather than a hand-written guess, so it is still fully offline — it just
caches each file separately and fetches them in parallel.

**The splash no longer pads.** It waited a flat 1,500 ms whether or not there
was anything left to wait for; cold start to an interactive menu measured
2,050 ms against a page that finished loading at 135 ms. It now ends when the
prefetch ends, with a 400 ms floor so the brand mark is not a single-frame
flash and the old 1,500 ms as a backstop for an image that never settles. The
native Capacitor splash came down from 1,200 ms to 600 ms; it shares the app's
background colour, so the hand-off is not visible.

---

## 24: what could not be verified here, and why

`npm run lint`, `npm run format:check`, `npm run typecheck:installed` and the
Vite builds **still have not executed anywhere**, for the same reason as last
time: this environment has no npm registry access, so ESLint, Prettier, the
real type packages and Vite cannot be installed. That was the finding. It is
not fixed by this pass and cannot be fixed from inside this environment.

What _is_ proven here, and was re-run after every change:

- 212 unit and integration tests (up from 169; none deleted or weakened)
- 75 browser tests (up from 60) across phone-portrait, phone-landscape and
  desktop — run against a build of the current application code produced by the
  _previous_ packaging pipeline, since the new one needs Vite. They prove the
  app behaves; they do not prove the new packaging, which is what the two test
  files below and the CI build step are for.
- the offline typecheck, clean
- the branding audit, clean

Because the build migration replaced a target that _could_ run here with one
that cannot, its two packaging steps were split into pure functions and tested:
`tools/build-single-file.test.ts` and `tools/build-pwa.test.ts`, 17 tests
between them. They do not prove Vite runs; they prove that when it does, the
document is actually self-contained, the APK's asset paths are relative rather
than root-absolute, and the service worker precaches every file that was
emitted. Those are the three mistakes that produce a build which looks correct
in a log and is blank on a device.

What changed about the risk: the build migration means the four unverified
gates now cover **every** build target rather than one, because there is only
one bundler left. That is the right trade — a single path that CI proves beats
two paths where the one with the slowest feedback is the one carrying deprecated
flags — but it does mean the first CI run is load-bearing, and the honest
expectation is that `typecheck:installed` finds real problems. The offline shims
in `types/` are narrower than `@types/node` and `@types/react` and will have
accepted code the real definitions reject. That is the specific reason both
typecheck modes exist; finding something there is the system working.

---

## Preservation checklist

Verified unchanged, by the full suite plus targeted diffing:

engine reducer semantics · five rulesets · card legality · draw and stacking ·
reverse and skip · declaration rules · penalties · elimination · hand swapping
and rotation · flip mechanics · protocol behaviour · authoritative server model
· reconnect · scoring outcomes · bot decision logic · accessibility affordances
· card rendering approach · visual design · progression and economy values

Two things in that list were touched deliberately and are the findings, not
regressions: the Result screen's _presentation_ of scores (#2, #3, #4) and the
header slot that held the clock (#1). No score, rule or economy value changed.

---

## Bugs this pass's own tests found

- The browser suite's shared helper did not know about the first-run name
  prompt, so every spec that opened the menu stopped at it. Specs now start as a
  returning player, and the prompt has its own spec — including that an empty
  name is refused rather than silently accepted.
- The online spec opened two browsers with no profile in either, so both seats
  would have been nameless. Each context now seeds a distinct name, and the
  spec asserts the two seats can be told apart — which is the actual bug #11
  described.
- The clock spec was still asserting on an element #1 removed. It now pins the
  replacement, and that the clock has not come back.
