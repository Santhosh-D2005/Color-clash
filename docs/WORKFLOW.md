# Rebuild workflow

How v2.0 gets built. One phase at a time, each one entered from a document and
exited through a gate. No phase starts before the previous one exits.

**The two standing rules:**

1. **Never skip the document.** Every phase names the document sections it implements. Work that is not in a document is not in the phase — it goes back into the document first.
2. **Never change a mechanism.** `PRESERVATION.md` is the contract, and `preservation.test.ts` enforces it. A rule change needs a new RF entry, not a passing build.

---

## The document set

| Document                               | Answers                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `PRD`                                  | What the product must do, and why                              |
| `TRD`                                  | How it is built — stacks, contracts, protocols, budgets, gates |
| `UI/UX Design Document`                | What it looks like and how it behaves                          |
| `System Architecture & Backend Schema` | Topology, realtime design, data model                          |
| `RULE_FLAGS.md`                        | Every place the source was silent, and what was chosen         |
| `PRESERVATION.md`                      | What may not change                                            |
| `BRANDING.md`                          | Asset provenance and licence                                   |
| `PUBLISHING.md`                        | Signing, store listing, release                                |

---

## Per-phase loop

Every phase runs the same seven steps. No step is optional.

```
1. READ      the document sections this phase implements
2. PLAN      state the exact files to change and the acceptance criteria,
             before writing code
3. BUILD     the smallest vertical slice that can be run and tested
4. TEST      add or update tests in the SAME change as the logic
5. GATE      run the full gate set; all of it, not the convenient parts
6. RECORD    write the phase report (below)
7. EXIT      only when every exit criterion is met
```

### The gate set

```bash
npm run typecheck             # offline shims — works with no install
npm run typecheck:installed   # authoritative — real @types
npm run lint
npm run format:check
npm test                      # unit, property, integration, network, preservation
npm run audit:brand
npm run build:pwa             # runs build:web first
npm run build:single
npm run test:e2e              # three viewports
```

CI runs all nine on every push. `npm run verify` is the local subset that needs
no browser.

### The phase report

Every phase ends with one, in `docs/phases/<n>-<name>.md`:

```
IMPLEMENTED   what changed, why, which files
DOCUMENT      which sections this satisfies; anything the work proved wrong
RULE IMPACT   rule source used, new flags, ambiguity preserved — or "none"
TESTS         added, updated, commands run, real results
KNOWN GAPS    explicit list only; no hidden assumptions
```

"Anything the work proved wrong" is not a formality. A document that survives
contact with the code unchanged usually means nobody checked.

---

## Phases

### Phase 0 — Foundation

**Documents:** TRD §11.4, §12 · PRESERVATION.md
**Goal:** a trustworthy baseline before anything is rebuilt.

- 0.1 Run every CI gate on the untouched repo. Four of them have never executed anywhere.
- 0.2 Fix what they break. `typecheck:installed` is expected to find real problems: the `types/` shims are narrower than `@types/node` and `@types/react` and have accepted code the real definitions will reject.
- 0.3 Land the preservation contract and its test.

**Exit:** all nine gates green on a clean checkout; `preservation.test.ts` passing.

### Phase 1 — Identity and persistence

**Documents:** PRD §5.1 · Architecture §7.2, §7.3 · TRD §10
**Goal:** a player is an account, not a string in `localStorage`.

Auth service, accounts and profiles schema, guest accounts, guest upgrade with
no loss, refresh-token rotation, server-owned profile.

**Exit:** sign in on two devices, see the same profile. Engine untouched.

### Phase 2 — Authoritative match service

**Documents:** TRD §6, §7, §8 · Architecture §4
**Goal:** the match server becomes a real service.

Real WebSocket library behind the existing `WsConnection` interface;
token-derived identity; host authorisation on `ADD_BOT` / `REMOVE_SEAT` /
`READY`; cluster-wide room codes; explicit `ACK`; `ackSeq` demoted to advisory;
RNG cursor in the checkpoint; drain on `SIGTERM`.

**Exit:** two clients survive a server restart mid-match with no divergence.

### Phase 3 — Rooms and social

**Documents:** PRD §5.2, §5.3 · UI/UX §5.2
**Exit:** create → share link → four devices → play → rematch.

### Phase 4 — Matchmaking

**Documents:** PRD §5.2 · Architecture §5
**Exit:** seating SLA met under synthetic load; bot backfill at 30 s.

### Phase 5 — Progression and economy

**Documents:** PRD §5.5 · Architecture §7.4, §7.5, §10
**Exit:** every balance reconstructible from its ledger.

### Phase 6 — Stats, history, leaderboards

**Documents:** PRD §5.6 · Architecture §7.7
**Exit:** stats agree with recomputation from raw match rows.

### Phase 7 — Polish and accessibility

**Documents:** UI/UX (all) · PRD §5.8
**Exit:** accessibility audit passes; three-viewport e2e green.

### Phase 8 — Hardening and launch

**Documents:** PRD §6.1 · TRD §10, §13 · PUBLISHING.md
**Exit:** launch-gate metrics met on staging; signed AAB plays online against web.

---

## Rules that apply in every phase

- **Inspect before editing.** Find the existing contract before adding a second one.
- **No duplicate implementation of a rule.** Ever.
- **No business logic in a component** to make the UI work.
- **Tests land with the logic,** not after.
- **An ambiguity becomes a flag,** never a silent behaviour.
- **Don't refactor unrelated systems** because you were passing through.
- **Determinism is preserved** through injectable RNG and reproducible fixtures.
