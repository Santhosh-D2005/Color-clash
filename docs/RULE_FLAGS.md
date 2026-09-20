# Rule flags and preserved ambiguities

The Master Blueprint is explicit about this (§18.1 rule 8, and the Master Prompt
under SOURCE AUTHORITY):

> Never silently alter a source-defined rule. Never invent a missing rule and
> bury it in code. If something is ambiguous, make it an explicit configuration
> option or a TODO with a test fixture.

This file is that ledger. Every entry names where the source is silent or
self-inconsistent, what the implementation does by default, where the switch
lives, and which test pins it.

Nothing outside this list was invented. Where the source states a rule, the
engine implements it verbatim — see the per-manifest header comments, which
quote the rule tables directly.

---

## RF-001 — Flip number distribution

**Source:** §2.3 pins the Flip _action_ counts exactly ("8 Skips, 8 Reverses,
8 Draw Ones, 8 Flips, 4 Wilds, 4 Wild Draw Twos" = 40 cards) but states no
number distribution. Appendix A Table 18 records the Flip deck size as
"source-defined dual side composition", i.e. deliberately unstated.

**Default:** no zero, two each of 1–9 per colour → 18 × 4 = 72 numbers, giving a
112-card deck. This is the only distribution that makes the source's own 40
action cards add up to a whole deck, and it matches the printed Flip contents.

**Switch:** `FLIP_NUMBERS` in `packages/game-content/src/decks.ts`.

**Tests:** `deck.test.ts` — "FLIP generates 112 cards…", plus the two tests that
assert every source-stated light and dark action count.

---

## RF-002 — Mayhem base composition

**Source:** §2.4 pins the total (168) and the _additions_ ("8 Draw Four,
8 Discard All, 4 Wild Draw Six, 4 Wild Draw Ten, 4 Wild Reverse Skip" = 28
cards). It does not restate the base. Classic's 108 plus those 28 is 136, so
32 cards are unaccounted for by the source text alone.

**Default:** every source-pinned count is honoured exactly; the remaining 32
slots are filled as one extra Skip / Reverse / Draw Two per colour (+12), three
Skip Everyone per colour (+12), and four extra Wild plus four extra Wild Draw
Four (+8).

| Card                            | Count   | Origin     |
| ------------------------------- | ------- | ---------- |
| Numbers (0×1, 1–9×2 per colour) | 76      | as Classic |
| Skip / Reverse / Draw Two       | 12 each | RF-002     |
| Draw Four                       | 8       | **SOURCE** |
| Discard All                     | 8       | **SOURCE** |
| Skip Everyone                   | 12      | RF-002     |
| Wild                            | 8       | RF-002     |
| Wild Draw Four                  | 8       | RF-002     |
| Wild Draw Six                   | 4       | **SOURCE** |
| Wild Draw Ten                   | 4       | **SOURCE** |
| Wild Reverse Skip               | 4       | **SOURCE** |
| **Total**                       | **168** | **SOURCE** |

**Switch:** `MAYHEM_DECK` in `packages/game-content/src/decks.ts`.

**Tests:** `deck.test.ts` — "…generates exactly 168 cards" and "…honours every
count the source pins verbatim", which asserts the five source counts from
`MAYHEM_SOURCE_PINNED` independently of the rest of the table. Changing the
RF-002 slots cannot silently break a source count.

---

## RF-003 — Flex deck size

**Source:** §2.6 defines the flex _mechanic_ in full (primary symbol plus a
secondary triangle matrix, a public power token, Flex Number / Flex Draw Two /
Flex Skip) but gives no deck. Table 18 records it as "source-defined flex
matrix".

**Default:** the Classic 108-card structure, with every coloured card also
carrying a secondary colour (the colour two positions along the wheel:
RED↔GREEN, YELLOW↔BLUE). This is the smallest deck that exercises every rule
the source does define.

**Switch:** `FLEX_DECK` in `packages/game-content/src/decks.ts`; the secondary
mapping is in `flexManifest.createDeck`.

**Tests:** `deck.test.ts` — "FLEX generates its declared deck and every coloured
card has a flex matrix"; `flex.test.ts` covers the mechanic itself.

---

## RF-004 — Flip colour assignment differs from the retail product

**Source:** §2.3 states "Light colors | Pink, Teal, Purple, Orange" and
"Dark colors | Dark Pink, Dark Teal, Dark Purple, Dark Orange".

The printed Flip product is the other way round: Blue/Green/Red/Yellow on the
light side, Pink/Teal/Orange/Purple on the dark side.

**Resolution:** the blueprint is the stated source of authority, so the engine
implements the blueprint's assignment. This entry exists so the difference is a
recorded decision rather than a bug someone rediscovers later.

**Location:** `packages/game-content/src/colors.ts`.

**Tests:** `deck.test.ts` — "FLIP light colours are the source-defined
Pink/Teal/Purple/Orange".

---

## RF-005 — Dark-side Skip is Skip Everyone

**Source:** §2.3 lists the dark actions as "8 Skips …" but separately defines a
dark rule row: "Dark Skip Everyone | Clear turn queue; play control returns
instantly to card player." The source therefore names the same eight cards two
different ways.

**Default:** the dark face of a light Skip is `SKIP_EVERYONE`, which satisfies
both the count and the rule row, and matches the printed product.

**Switch:** `FLIP_DARK_SKIP_IS_SKIP_EVERYONE` in `decks.ts`.

**Tests:** `deck.test.ts` dark-side counts; `flip.test.ts` — "Skip Everyone
returns control instantly to the card player".

---

## RF-006 — Scoring table

**Source:** no scoring rule anywhere in the blueprint. The Score/Result screen
(§9.1) and the summary mock require one.

**Default (`scoringMode: 'STANDARD'`):** the winner banks the point value of
every card still held by the other players; each of those players records the
negative of their own remaining hand, so the match total shows a spread. Card
values are the conventional ones — number cards at face value, action cards 20,
wilds 50 (`cardPoints` in `decks.ts`).

**Presentation.** The cumulative total is negative for everyone except the
winner, and shown raw it reads as a fine rather than a result. The summary
screen therefore leads with the two underlying facts — what the winner banked,
and how many cards each other player was caught holding — and shows the
cumulative total as a sub-line. This is a display decision only; the arithmetic
above is unchanged, and `Standing` simply carries `handValue` and `banked`
alongside `score` so a screen does not have to recompute them.

**Switch:** `MatchConfig.scoringMode`; `'NONE'` disables scoring entirely.

**Structure.** `calculateRoundScore(state, winnerId)` is pure and returns the
breakdown; `applyRoundScore(state, result)` performs the single mutation;
`scoreRound` is the composition of the two, which is what the reducer calls.
Splitting them removed a trap: reading a round's numbers used to mean calling
the scoring function a second time with scoring switched off.

**Tests:** `scoring.test.ts` pins that calculating mutates nothing, that
applying changes state exactly once, and that the two halves compose to the
original behaviour; also exercised through the full-round integration tests.

---

## RF-007 / RF-008 — Opening discard handling

**Source:** §2.1 says only "Move top DrawPile card to DiscardPile; execute
special action checks if it is an action/wild."

Read literally, an opening action card takes effect against the first player,
and that is what `resolveOpeningDiscard` does: an opening Skip skips seat 0, an
opening Draw Two makes seat 0 draw two and lose its turn, an opening Wild (and
Wild Draw Four) demands a colour before play begins.

**RF-008** covers the one case the literal reading does not settle: an opening
**Reverse** has no previous player to reverse _from_. The default flips the
direction and leaves the turn on the dealer seat (the seat before player 0), so
the dealer plays first — the table convention. It is expressed as
`[{ REVERSE }, { NO_ADVANCE }]` in each manifest's `resolveOpeningDiscard`, so
changing it is a one-line edit in one place per ruleset.

**Tests:** `edgeCases.test.ts` — "opening discard is an action card" and
"opening discard is a wild…".

---

## RF-009 — Wild Draw Four challenge

**Source:** Appendix A Table 9 lists `CHALLENGE_WILD_DRAW_FOUR` as an "optional
challenge hook | Only if enabled by version config", and defines no outcome.

**Default:** `challengeWildDrawFour` is `false`. With the flag off the command is
rejected as `CHALLENGE_DISABLED`; with it on the engine throws
`CHALLENGE_NOT_SPECIFIED` naming this entry. It deliberately does **not** guess
a penalty. Implementing it means adding the rule here first.

**Location:** `applyChallenge` in `packages/game-engine/src/reduce.ts`.

---

## RF-010 — Flip side pairing and dark numbers

**Source:** silent on which dark colour backs which light card, and on whether
the dark number differs from the light one.

**Default:** same colour family (Pink ↔ Dark Pink) and the same number on both
sides — the minimal non-inventing choice. The retail product scrambles both,
which makes the unseen side genuinely unknown; `FLIP_SIDE_PAIRING = 'ROTATED'`
and `FLIP_DARK_NUMBERS = 'SHIFTED'` switch to that behaviour.

**Location:** `packages/game-engine/src/versions/flip.ts`.

---

## RF-011 — Wild Rush colour declaration

**Source:** §2.5 says every card is "structurally Wild" and legality is not
colour matching, but does not say which cards require a colour declaration.

**History.** The first implementation asked for a colour on every play, on the
reasoning that the cards are all wilds and `activeColor` must always be defined
(an engine invariant, §6.1). That was defensible and, in play, wrong: because
`isPlayable` in this mode is unconditional and nothing else in the ruleset reads
the active colour — there is no Discard All and no draw-until-colour here — the
declaration decided nothing at all. The mode became a sequence of modal dialogs
between cards.

**Default (`ALL_WILD_COLOR_MODE = 'AUTO'`):** the colour is assigned rather than
requested, derived from the played card's own id. That keeps the invariant, and
being a pure function of the card makes it identical in local play, on the
server, for a bot, and after a reconnect, without consuming a random number or
depending on turn order.

The _target_ choice on Wild Target Draw Two is untouched: unlike colour, it
changes the outcome.

**Switch:** `ALL_WILD_COLOR_MODE` in `packages/game-engine/src/versions/allWild.ts`.
Setting it to `'PLAYER'` restores the prompt.

**Tests:** `allWild.test.ts` — the "colour handling (RF-011)" block pins both
modes, the determinism of the derived colour, and that the invariant still
holds after every play.

---

## RF-012 — Flex token reset

**Source:** §2.6 says the token is consumed "until globally reset" but never says
when the reset happens.

**Default:** the tracker resets at the start of each round
(`getStartingState` returns `flexPowerAvailable: true`).

**Switch:** `FLEX_RESET` in `packages/game-engine/src/versions/flex.ts`.

**Tests:** `flex.test.ts` — "the token cannot be spent twice".

---

## RF-013 — What "matching or higher" qualifies

**Source:** §2.4 — "Draw penalties +2/+4/+6/+10 can pass iteratively when
matching or higher cards are played".

**Resolution:** the phrase qualifies the _penalty magnitude_, not the colour. A
response must be a draw card worth at least the current minimum response
penalty; no colour match is required. An earlier draft imposed a colour
requirement as well and was corrected — that would have been an invented rule.

**Location:** `defaultCanRespondToPenalty` in
`packages/game-engine/src/legal.ts`.

**Tests:** `mayhem.test.ts` — "a matching-or-higher card passes the stack on"
and "a lower draw card cannot answer a higher stack".

---

## RF-014 — Artwork and licensing (RESOLVED)

**Source:** §9.3 — "Create original visual assets and a visual identity that is
inspired by classic card-game readability but does not copy a licensed brand's
exact card art, typography, layout, sounds, or logos unless rights are
obtained." The Launch Checklist repeats it: "Verify original art/audio/assets
and licensing status."

**History.** Every image in the client used to be a crop of the key-art sheet
supplied with the brief, used exactly as provided because the brief said not to
substitute it. That artwork carried a registered wordmark belonging to another
company. The item was open while the build was private and became **blocking**
the moment public distribution entered scope.

**Resolution.** The project was rebranded to **Color Clash**. Every image is now
generated from original vector sources in `tools/gen-brand.ts`, the declaration
call is "Clash", and the five modes have their own names. The rules did not
change at all — a shedding-type card game's rules are not protectable, so the
engine, the five rulesets, the tests and the multiplayer layer carried forward
untouched, and the 131 tests that existed before the rebrand passed after it
without modification.

`npm run audit:brand` fails the build if the previous mark reappears anywhere
shippable, and it runs in CI.

Full record, including the licence status of every asset class: `docs/BRANDING.md`.
