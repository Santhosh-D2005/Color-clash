# Preservation contract

> **The rebuild changes the product around the game. It does not change the game.**

This document is the rule that governs every phase of the v2.0 rebuild. It
exists because the rebuild touches almost everything _except_ the part that
already works, and the easiest way to lose a year of rule work is to "improve"
it while passing through.

It is enforced, not merely stated: `packages/game-engine/test/preservation.test.ts`
asserts every value in this document and runs inside `npm test`, which runs in
CI on every push.

---

## 1. What is frozen

### 1.1 The engine contract

```ts
reduce(state, command, rng) => { state, events }
```

Pure. No clocks, no I/O, no globals, no `Math.random`. The same function backs
local play, the authoritative server, the bots and every test. A ruleset never
mutates state; it returns an ordered `Resolution[]` that the engine applies.

Frozen with it: the `Command` set, the `GameEvent` set, the `Resolution` set,
the `VersionManifest` interface, the choice-continuation encoding, and the
seven invariants asserted after every accepted command.

### 1.2 The five rulesets

| Mode          | Engine id  | Deck | Status |
| ------------- | ---------- | ---- | ------ |
| Classic Clash | `CLASSIC`  | 108  | Frozen |
| Flipstorm     | `FLIP`     | 112  | Frozen |
| Mayhem        | `MAYHEM`   | 168  | Frozen |
| Wild Rush     | `ALL_WILD` | 112  | Frozen |
| Freestyle     | `FLEX`     | 108  | Frozen |

Deck composition, card legality, penalty stacking, turn advancement, reverse and
skip behaviour, the Clash call and its penalty, elimination, hand swapping and
rotation, flip mechanics, and scoring are all frozen.

### 1.3 Source-defined constants

| Constant                     | Value                                    | Source           |
| ---------------------------- | ---------------------------------------- | ---------------- |
| Cards dealt per player       | 7                                        | §2.1             |
| Clash penalty                | 2 cards                                  | §2.1             |
| Mayhem elimination threshold | 25 cards                                 | §2.4             |
| Rule player limit            | 2–10                                     | §2.1             |
| Seat limit (product)         | 2–6                                      | Product decision |
| Penalty vector               | +1 / +2 / +4 / +5 / +6 / +10             | §2.4             |
| Scoring                      | numbers face value, actions 20, wilds 50 | RF-006           |

### 1.4 The RF ledger

Every entry in `RULE_FLAGS.md` (RF-001 … RF-014) keeps its recorded default.
The flags whose values are asserted directly:

| Flag                             | Value                                              |
| -------------------------------- | -------------------------------------------------- |
| RF-004 Flipstorm light colours   | Pink, Teal, Purple, Orange (blueprint, not retail) |
| RF-005 dark face of a light Skip | `SKIP_EVERYONE`                                    |
| RF-007 opening action card       | Resolves against the dealer seat                   |
| RF-009 Wild Draw Four challenge  | Off — the source defines no outcome                |
| RF-010 Flipstorm side pairing    | `IDENTITY` / `MIRROR`                              |
| RF-011 Wild Rush colour          | `AUTO`                                             |
| RF-012 Freestyle token reset     | `ROUND_START`                                      |
| RF-013 stack response            | Magnitude only, no colour requirement              |

### 1.5 The information boundary

A bot receives exactly the `PlayerView` a human client receives. There is no
code path from a bot to authoritative `GameState`. Difficulty may improve
decision quality; it may never create information. This is structural, and
removing it is not a refactor.

---

## 2. What the rebuild is free to change

Everything else, specifically:

- Transport, protocol framing, acknowledgement semantics, session handling.
- Where the authoritative state is hosted and how it is checkpointed.
- Identity, accounts, persistence, matchmaking, economy, stats, leaderboards.
- Every screen, every animation, every string, the routing model, state management.
- Build tooling, packaging, CI, deployment.
- Pacing and presentation — these are allowed to change freely, because they
  cannot change which commands are accepted or in what order.

---

## 3. How to change something that is frozen

There is a way. It is deliberately not a quick one.

1. Open an RF entry in `RULE_FLAGS.md` with a new id: the ambiguity or the reason, the options, the chosen value, and where the switch lives.
2. Put the new value behind a named constant, not inline.
3. Update `preservation.test.ts` in the **same commit**, so the diff shows the rule change next to its assertion.
4. Say so in the commit message.

A change that cannot be described that way is not a rule change, it is a
regression.

---

## 4. When a preservation test fails

**Do not update the expected value to make it pass.** That is almost always
the wrong move, and it is the exact failure mode this file exists to prevent.

Work through this instead:

1. **Which phase touched this?** If the answer is "the matchmaking phase", a rule constant has no business being in that diff.
2. **Is the test wrong?** This happens, and it is legitimate. The first version of the setup test asserted that every hand holds exactly 7 cards after `createMatch`. That is false by design: an opening Draw Two makes seat 0 draw two before anyone acts, which is RF-007 working correctly. The test was asserting that RF-007 _doesn't_ happen. It was rewritten to assert the deal itself, via the `CARD_DEALT` events, and to assert RF-007's behaviour separately and on purpose.
3. **Is the rule genuinely changing?** Then §3 applies.

The distinction that matters: a test can be wrong about what the rule is. It is
never allowed to be quietly edited into agreeing with whatever the code now does.

---

## 5. Frozen paths

Changes under these paths should be rare, reviewed, and accompanied by a test
change:

```
packages/game-engine/src/**
packages/game-content/src/decks.ts
packages/game-content/src/limits.ts
packages/game-content/src/versions.ts     (DEFAULT_CONFIG, VERSION_CONFIG_DEFAULTS)
packages/game-content/src/colors.ts
packages/ai/src/**                        (the information boundary, not the scoring weights)
docs/RULE_FLAGS.md
```

Bot _scoring weights_ are tuning, not mechanism, and may be changed freely. The
`PlayerView`-only input is mechanism and may not.

---

## 6. The regression gate

```bash
npm test          # 270 tests, including 43 preservation assertions
npm run typecheck # offline, works with no dependencies installed
```

Both must pass before any phase is considered complete. Neither requires
network access, which is the point: the mechanism lock can be verified
anywhere, including on a machine that cannot reach a package registry.
