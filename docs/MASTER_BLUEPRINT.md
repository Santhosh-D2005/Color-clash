# CLASH Multi-Version Master Vibe-Coding Blueprint

> Source document supplied with the brief, converted to Markdown for reference.
> The implementation cites it by section throughout.

CLASH MULTI-VERSION DIGITAL GAME
MASTER VIBE-CODING BLUEPRINT
Game Design + Engineering + UX + AI Coding Specification
Important: This document separates source-defined rules from implementation recommendations. The source-defined rules should not be silently changed by the coding agent. Any unresolved ambiguity must become a configurable rule flag, an explicit TODO, or a test expectation - never an invented hidden rule.

## 0. Document Navigation

1. Product Vision and Scope
2. Source-of-Truth Rule Ledger
3. Product Modes and Player Experience
4. Technical Architecture
5. Canonical Domain Model
6. Game State Machine
7. Shared Rule Engine
8. Version Engines
9. UI/UX Blueprint
10. Multiplayer and Synchronization
11. AI Opponent Architecture
12. Audio, Animation, Accessibility
13. Economy and Monetization Guardrails
14. Data, Persistence, Analytics
15. Security and Anti-Cheat
16. Testing and QA
17. Build Order / Milestones
18. Claude/Vibe-Coding Operating Protocol
19. Master Prompt for Claude
20. Phase Prompts
21. Definition of Done
22. Launch Checklist
    Appendix A. Rule Tables
    Appendix B. Event Taxonomy
    Appendix C. Example State Fixtures

## 1. Product Vision and Scope

Goal: build a polished digital card game platform with a shared deterministic engine and multiple rule-set modules. The player should feel that every version is a distinct ruleset while the product remains one coherent application.

### 1.1 Design Pillars

- Instant readability: at any moment, the player can tell whose turn it is, what card is active, what actions are legal, and what the consequences are.
- Deterministic rules: the authoritative game state is reproducible from commands/events; UI is never allowed to invent game logic.
- Modular versions: Classic, Flip, Show ’Em Mayhem, All Wild, and Flex are separate rule modules sharing a common engine contract.
- Fast rounds: input, animation, and resolution must feel immediate. Network latency should not create duplicate actions or desynchronized hands.
- Configuration over hardcoding: card counts, action effects, stacking settings, player limits, and visual themes live in version manifests.
- Vibe-coding safe: the project is organized so an AI coding agent can implement one vertical slice at a time without rewriting unrelated systems.

### 1.2 Scope

## 2. Source-of-Truth Rule Ledger

The supplied blueprint is the baseline specification for core rules. It defines a global state machine, valid-move checks, CLASH penalties, draw-pile recycling, and five named engines. These details are reproduced below so the implementation team and coding agent have an exact reference. fileciteturn0file0L4-L24

### 2.1 Global Rules Base - source-defined

### 2.2 Classic - source-defined

### 2.3 Flip - source-defined

Note: The source blueprint uses the label “Wild Draw Color Card” for the final Dark-side rule. Preserve that name internally unless you intentionally introduce a user-facing alias. fileciteturn0file0L51-L59

### 2.4 Show ’Em Mayhem - source-defined

### 2.5 All Wild - source-defined

### 2.6 Flex - source-defined

## 3. Product Modes and Player Experience

### 3.1 Main Flow

1. Boot -> splash -> profile/guest -> home.
1. Home -> select mode -> configure players/rules -> lobby/setup.
1. Match -> tutorial overlay only for new rule mechanics -> play.
1. Round end -> winner/score summary -> rematch, next round, exit.
1. Progression -> cosmetics/stats/achievements only; no pay-to-win rule changes.

### 3.2 Match Types

## 4. Technical Architecture

Recommended stack for vibe coding: React + TypeScript frontend, Node.js + TypeScript authoritative match server, WebSocket transport (Socket.IO or native WebSocket), shared pure TypeScript game-engine package, and a lightweight persistence layer. The key architecture rule is that the same deterministic engine package is imported by server, bots, tests, and local mode.

### 4.1 Monorepo

/apps
/client # React UI, animation, local input, screens
/server # Match rooms, WebSocket transport, authority
/packages
/game-engine # Pure rules, state transitions, validators
/game-content # Version manifests, card metadata, localization keys
/ai # Bot strategies using legal-move queries
/shared # Types, event schemas, utilities
/test-fixtures # deterministic decks and state snapshots
/docs
MASTER_BLUEPRINT.md

### 4.2 Dependency Rules

- UI imports engine types and command contracts, but never mutates game state directly.
- Engine must not import React, DOM, browser APIs, or network code.
- Server owns authoritative state in online matches.
- Bots submit the same commands as human clients.
- Every ruleset registers through a VersionManifest interface.
- All randomization accepts an injectable seeded RNG in tests.

## 5. Canonical Domain Model

type PlayerId = string;
type CardId = string;
type Color = string;
type Direction = 1 | -1;
type DeckSide = 'LIGHT_SIDE' | 'DARK_SIDE';

type Card = {
id: CardId;
kind: CardKind;
primaryColor?: Color;
value?: number | string;
sides?: { light: CardSideData; dark: CardSideData };
flex?: FlexCardData;
};

type PlayerState = {
id: PlayerId;
name: string;
isBot: boolean;
hand: CardId[];
eliminated: boolean;
connected: boolean;
};

type GameState = {
gameId: string;
version: GameVersion;
players: PlayerState[];
drawPile: CardId[];
discardPile: CardId[];
activePlayerIndex: number;
direction: Direction;
activeColor?: Color;
deckSide?: DeckSide;
pendingDraw: number;
pendingTargetPlayerId?: PlayerId;
awaitingChoice?: ChoiceState;
flexPowerAvailable?: boolean;
roundNumber: number;
status: 'SETUP' | 'PLAYING' | 'ROUND_END' | 'MATCH_END';
};

### 5.1 Command Contract

## 6. Game State Machine

The state machine is the most important contract for Claude. Implement the game engine as a pure function: previous state + command + RNG context -> next state + emitted events. Never place rule effects directly inside React click handlers.
reduce(state, command, rng) => {
assertCommandIsAllowed(state, command);
const next = cloneState(state);
const events = [];

switch (command.type) {
case 'PLAY_CARD':
validatePlay(next, command);
applyCardEffect(next, command.cardId, command.playerId, events, rng);
break;
case 'DRAW_CARD':
applyDraw(next, command.playerId, events, rng);
break;
case 'CALL_CLASH':
applyClashCall(next, command.playerId, events);
break;
// ...all commands route through engine rules
}

checkTerminalConditions(next, events);
assertInvariants(next);
return { state: next, events };
};

### 6.1 Invariants

- Every card exists in exactly one zone: a player hand, draw pile, discard pile, or transient command payload before commit.
- No player has duplicated CardId.
- Exactly one active player exists while status is PLAYING, unless the ruleset explicitly resolves a global effect.
- activeColor always matches the current color requirement after a wild is resolved.
- drawPile recycling never moves the current top discard into the draw pile.
- Eliminated players cannot act or become legal targets unless a ruleset explicitly allows it.
- After every command, the resulting state passes structural validation.

## 7. Shared Rule Engine

### 7.1 Setup Algorithm

1. Load VersionManifest and generate cards.
1. Shuffle with Fisher-Yates using injectable RNG.
1. Deal exactly 7 cards to every player.
1. Create discard pile from draw pile top.
1. Resolve any required opening-card action through the ruleset hook.
1. Set active player and direction.
   function drawToPlayer(state, playerId, count, rng) {
   for (let i = 0; i < count; i++) {
   ensureDrawPile(state, rng); // recycle discard except top when needed
   const cardId = state.drawPile.pop();
   if (!cardId) throw new Error('DRAW_PILE_EMPTY');
   player(state, playerId).hand.push(cardId);
   }
   }

### 7.2 Legal Move Pipeline

isPlayable(state, cardId, playerId) {
if (!isPlayersTurn(state, playerId)) return false;
if (!ownsCard(state, playerId, cardId)) return false;
if (state.pendingDraw > 0) return rules.canRespondToPenalty(state, cardId);
return rules.isPlayable(state, cardId);
}
Order of checks: turn ownership -> card ownership -> pending forced response -> version-specific legality -> common color/value/wild checks -> optional choice/flex modifiers.

### 7.3 CLASH Timing

- Playing a card that reduces a hand from 2 to 1 enters CLASH_PENDING immediately.
- The UI should display a prominent “CLASH!” action and a shrinking, rule-configured grace window if the implementation includes such timing feedback.
- CALL_CLASH must be idempotent: repeated calls cannot create multiple rewards or penalties.
- If the next game action occurs first, apply the source-defined 2-card penalty.

## 8. Version Engines

### 8.1 VersionManifest Interface

interface VersionManifest {
id: GameVersion;
playerLimit: { min: number; max: number };
createDeck(): Card[];
getStartingState(ctx: SetupContext): Partial<GameState>;
isPlayable(ctx: RuleContext, card: Card): boolean;
resolveCard(ctx: ResolveContext, card: Card): Resolution[];
resolveOpeningDiscard?(ctx: OpeningContext): Resolution[];
afterDraw?(ctx: DrawContext): Resolution[];
onRoundEnd?(ctx: RoundEndContext): Resolution[];
}

### 8.2 Classic implementation checklist

- 108 cards generated exactly from the source distribution.
- Opening action-card behavior is isolated in resolveOpeningDiscard instead of hidden in setup.
- Reverse uses direction = direction * -1; for 2 players resolve as Skip behavior per source.
- Draw Two applies 2 cards to target and advances over target.
- Wild and Wild Draw Four require color-selection state before turn continuation.
- CLASH penalty and discard recycling use shared engine behavior.

### 8.3 Flip implementation checklist

- Every physical card has light-side and dark-side data or a normalized mapping to both sides.
- Flip commits atomically: change deckSide, refresh active color context, and update visuals in one event chain.
- Light and dark action matrices are separate rule tables.
- Skip Everyone is represented as a turn-resolution strategy, not a hard-coded UI animation.
- Wild Draw Color keeps drawing for the target until the chosen color condition is met.

### 8.4 Show ’Em Mayhem implementation checklist

- Draw penalties are represented as an explicit stacking context: pendingDraw and minimumResponsePenalty.
- Elimination check runs immediately after every draw.
- 7 and 0 effects operate on authoritative player hand arrays, never visual copies.
- Discard All filters the acting hand by active/matching color and moves matching cards to discard in one transaction.
- Wild Reverse Skip is modeled as a combined effect so direction and skipping cannot drift.

### 8.5 All Wild implementation checklist

- Card legality is not color/value matching; all cards are structurally Wild.
- Target selection must be explicit for Wild Target Draw Two.
- Wild Double Skip changes turn index by +3 according to source definition.
- Use an action queue for multi-effect cards so resolution remains deterministic.

### 8.6 Flex implementation checklist

- Each card stores primary and secondary action/color data.
- FlexPowerTracker is public state and can be observed by all clients.
- Flex use consumes the token atomically with card play.
- Flex Number modifies legality only if primary validation fails.
- Flex Draw Two and Flex Skip resolve as alternative effects, not as separate cards.

## 9. UI/UX Blueprint

### 9.1 Screen Map

### 9.2 Card Interaction Rules

- Tap card -> lift/highlight -> engine checks legality -> if legal, animate to discard and resolve event sequence.
- Illegal cards are visually clear but not visually punishing; show a small reason such as “Match color, number, or wild.”
- Choice cards pause progression with a focused modal; the active player cannot accidentally play another card underneath.
- Hands use compact fan/stack layout on mobile and wider spread on desktop/tablet.
- All important game outcomes have a non-color cue: icon, text, animation, or number.

### 9.3 Visual System

Create original visual assets and a visual identity that is inspired by classic card-game readability but does not copy a licensed brand’s exact card art, typography, layout, sounds, or logos unless rights are obtained.

## 10. Multiplayer and Synchronization

### 10.1 Authoritative Server Model

Client -> Command -> Server validates -> Engine reduce() -> Events -> Server broadcasts snapshot/delta -> Clients animate

- Clients never authoritatively decide if a card is legal.
- Each match has a monotonic sequence number for accepted commands.
- Commands include commandId for idempotency and playerId for authorization.
- On reconnect, client requests latest authoritative snapshot plus missed events.
- Animation state can be rebuilt from authoritative state, but game state cannot be inferred from animation state.

### 10.2 Room Lifecycle

1. CREATE_ROOM
1. JOIN_ROOM
1. READY_CHECK
1. START_GAME
1. PLAYING
1. ROUND_END
1. REMATCH or CLOSE_ROOM

## 11. AI Opponent Architecture

Bots should use the same command API as humans. A bot receives a sanitized public state plus its own private hand, asks the engine for legal moves, scores those moves, and submits exactly one command.

### 11.1 Bot tiers

### 11.2 AI safety rule

AI must never call private information that is unavailable to humans in the same mode. Difficulty should improve decision quality, not create invisible information.

## 12. Audio, Animation, Accessibility

- Events drive audio: card draw, card play, penalty, flip, CLASH call, elimination, round win.
- Every major event has an accessibility equivalent: caption, icon, text announcement, and vibration option.
- Support reduced motion, mute, lower effects, larger text, high-contrast mode, and left-handed layout.
- Never make color the only signal for active color or legal play.

## 13. Economy and Monetization Guardrails

Monetization should protect the integrity of the game. Do not sell rule advantages in competitive modes.

## 14. Data, Persistence, Analytics

### 14.1 Persistence

- Guest profile stored locally.
- Cloud account is optional until online persistence is required.
- Save versioned settings and cosmetics; never persist authoritative match state client-side as the source of truth.
- Use migrations for save schema changes.

### 14.2 Analytics events

## 15. Security and Anti-Cheat

- Validate all commands server-side in online play.
- Use opaque player IDs and room tokens; do not expose private hand contents to other clients.
- Rate-limit commands to prevent spam and duplicate submissions.
- Reject stale sequence numbers and replayed commandIds.
- Keep a compact audit trail of accepted commands for debugging and dispute analysis.

## 16. Testing and QA

### 16.1 Test Pyramid

### 16.2 Must-pass edge cases

- 2-player Reverse behavior.
- Opening discard is an action/wild.
- Draw pile empties while penalty is pending.
- CLASH called and missed around the same command boundary.
- Player disconnects while a color/target choice is pending.
- Show ’Em Mayhem stacking reaches a player who cannot answer.
- Mayhem player hits 25 cards exactly after a draw.
- Flip occurs while animations are active.
- All Wild target is self / eliminated target handling.
- Flex token consumption and simultaneous effects.
- Late join attempt after match has started.
- Reconnect after a client missed three or more state updates.

### 16.3 Deterministic fixture example

const fixture = {
version: 'CLASSIC',
players: [
{ id: 'P1', hand: ['R7','G2'] },
{ id: 'P2', hand: ['B7','Y9'] }
],
discardPile: ['R5'],
drawPile: ['WILD', 'B2', 'G9'],
activePlayerIndex: 0,
direction: 1,
activeColor: 'RED',
pendingDraw: 0
};

## 17. Build Order / Milestones

## 18. Claude / Vibe-Coding Operating Protocol

Use Claude as a senior pair-programmer that must obey the repository contracts. The agent should modify only the files necessary for the current task, explain architectural impact briefly, and keep the engine pure and testable.

### 18.1 Rules for every coding session

1. Read the existing repository structure before changing code.
1. Find the current engine contracts, version manifests, state types, tests, and UI entry points.
1. Never create duplicate competing implementations of the same rule.
1. Before coding, state the exact files to change and the acceptance criteria.
1. Implement the smallest vertical slice that can be executed and tested.
1. Add or update tests in the same change as rule logic.
1. Run typecheck, unit tests, and the relevant smoke test after implementation.
1. If a source rule is ambiguous, do not invent a silent behavior. Encode the ambiguity behind a named configuration flag or TODO and report it.
1. Never move business logic into components just to make the UI work.
1. Preserve deterministic behavior through injectable RNG and reproducible fixtures.

### 18.2 Change-report format Claude must return

IMPLEMENTED

- What changed
- Why it changed
- Files modified

RULE IMPACT

- Rule source used
- New rule flags / configuration
- Any ambiguity preserved

TESTS

- Added
- Updated
- Commands run
- Results

KNOWN GAPS

- Explicit list only; no hidden assumptions

## 19. Master Prompt for Claude

Copy the following prompt as the system/project prompt for the coding agent. Then use the phase prompts in Section 20 one at a time.
You are the lead engineer, senior game designer, gameplay programmer, UX architect, multiplayer engineer, QA lead, and release engineer for a production-quality multi-version digital card game.

PROJECT GOAL
Build a modular digital card game platform based on the supplied CLASH-style rule blueprint. The product must support these five rulesets as independent engine modules: CLASSIC, FLIP, MAYHEM, ALL_WILD, and FLEX.

SOURCE AUTHORITY
The project specification supplied by the user is the source of truth for stated game rules. Never silently alter a source-defined rule. Never invent a missing rule and bury it in code. If something is ambiguous, make it an explicit configuration option or a TODO with a test fixture.

ARCHITECTURE

- TypeScript everywhere.
- React client.
- Node/TypeScript authoritative server for online matches.
- Pure shared game-engine package with no UI/network dependencies.
- WebSocket transport for online play.
- Same command interface for human players and bots.
- Seeded/injectable RNG in tests.

ENGINE CONTRACT
Model the game as: state + command + RNG -> nextState + events.
All gameplay rules live in the engine. React only renders state and dispatches commands.
Every accepted command must preserve game invariants.

COMMON RULES

- 2 to 10 players.
- Deal 7 cards to every player during setup.
- Maintain draw pile and discard pile.
- Default turn order is clockwise.
- A legal card can match active color, match value/action, or use the appropriate wild override.
- Moving from more than 1 card to exactly 1 requires CLASH call; if missed before the next action, apply the 2-card penalty.
- If draw pile is empty, recycle discard cards except the top card and shuffle with Fisher-Yates.

VERSION CONTRACTS
CLASSIC

- 108-card structure exactly as specified.
- Skip, Reverse, Draw Two, Wild, Wild Draw Four behaviors exactly as specified in the project blueprint.

FLIP

- Track LIGHT_SIDE / DARK_SIDE globally.
- Each card has both side definitions.
- Flip toggles deck side and immediately changes active rules and visuals.
- Light and dark card distributions/effects must match the project blueprint.

MAYHEM

- 168-card structure and added aggressive cards as specified.
- Implement stacking as explicit penalty context.
- Eliminate a player immediately when the post-draw hand size reaches 25 or more.
- Implement 7 hand-swap and 0 hand-rotation.

ALL_WILD

- 112 cards, all structurally Wild.
- Implement target draws and double skips exactly as specified.

FLEX

- Support primary and secondary card action/color matrices.
- Public FlexPowerTracker controls whether a flex action is available.
- Flex actions consume the power token atomically.

STATE SAFETY

- A card must exist in exactly one location.
- No duplicated CardIds.
- No illegal active player.
- No stale pending choice.
- All client-facing state must be derived from authoritative state.

UI/UX
Build a polished mobile-first experience with readable cards, obvious turn ownership, clear legal/illegal feedback, focused choice modals, responsive layouts, accessibility support, and reduced-motion mode. Use original visual assets; do not copy licensed brand art or logos.

MULTIPLAYER
The server validates every command. Each command has a unique commandId and sequence number. Handle reconnect, duplicate commands, stale commands, and state resync. Never trust client-side rule decisions.

AI
Bots use the same commands as humans and may only use information available to humans in that mode.

TESTING
Every new rule requires unit tests plus at least one end-to-end fixture. Include edge cases for player count, empty draw pile, penalties, CLASH timing, choices, reverses, flips, elimination, disconnects, and repeated commands.

WORK STYLE

1. Inspect before editing.
2. Identify exact files.
3. Implement one vertical slice.
4. Add tests.
5. Run tests/typecheck.
6. Report changed files, rule impact, tests, and known gaps.
7. Do not refactor unrelated systems unless required by the current acceptance criteria.

DEFINITION OF DONE FOR EACH TASK

- Compiles.
- Relevant automated tests pass.
- No duplicate rule implementation exists.
- UI state is driven by engine state.
- Network path, when applicable, uses authoritative server validation.
- Known ambiguities are explicit, documented, and testable.
- The feature can be demonstrated from a clean start.

Before making changes, respond with: CURRENT STATE, FILES TO CHANGE, IMPLEMENTATION STEPS, ACCEPTANCE TESTS. Then implement the task.

## 20. Phase Prompts

Use one prompt at a time. Do not ask Claude to build the entire application in one response. Each prompt is intentionally scoped to reduce context loss and regression.

### Phase 0 - Repository Audit

Inspect the repository as a senior engineer. Do not code yet. Map the current directory structure, identify the frontend entry point, backend entry point, state management, tests, build system, package manager, and any existing game logic. Compare what exists to the Master Blueprint. Return: architecture map, missing systems, duplicate systems, highest-risk issues, and a recommended implementation order. Do not rewrite anything.

### Phase 1 - Engine Foundation

Implement the pure game-engine foundation. Create canonical Card, PlayerState, GameState, Command, Event, RNG, and VersionManifest contracts. Implement setup, 7-card dealing, draw/discard zones, turn tracking, card conservation invariants, seeded shuffle, and shared legal-move helpers. Add deterministic tests before moving on. No UI work yet.

### Phase 2 - Classic Vertical Slice

Implement CLASSIC end to end using the source blueprint. Generate the 108-card deck exactly. Implement Skip, Reverse, Draw Two, Wild, Wild Draw Four, CLASH call/penalty, and draw-pile recycling. Build the minimum playable React table and a local bot. Add a full deterministic round fixture and run all tests. Do not implement other versions yet.

### Phase 3 - Multiplayer

Add authoritative online room play around the existing engine without changing engine rules. Implement room creation, join, ready/start, command IDs, sequence numbers, server validation, broadcast, reconnect, resync, and duplicate-command rejection. Add latency simulation tests. Keep local mode working.

### Phase 4 - Flip

Implement FLIP as a separate VersionManifest using the exact light/dark distributions and effects from the blueprint. Build dual-side card data, DeckSide state, Flip resolution, Light/Dark visual theme switching, and deterministic tests for every special action. Verify a flip mid-round leaves all clients synchronized.

### Phase 5 - Show Em Mayhem

Implement MAYHEM as an isolated ruleset. Add the 168-card structure, +2/+4/+6/+10 stacking context, 25-card elimination threshold, 7 hand swap, 0 hand rotation, Discard All, Wild Draw Six, Wild Draw Ten, and Wild Reverse Skip. Stress-test the penalty chain and elimination logic. Do not leak these rules into Classic.

### Phase 6 - All Wild

Implement ALL_WILD using a version-specific rules module. Generate the 112-card structure exactly, implement target draw twos, wild skips, reverses, double skips, wild draw fours, and all relevant choice states. Add target-selection UI and bot behavior.

### Phase 7 - Flex

Implement FLEX. Add primary and secondary action/color matrices, public FlexPowerTracker state, flex-token consumption, Flex Number legality fallback, Flex Draw Two, and Flex Skip. Build visual indicators that make primary vs flex use obvious. Add simultaneous-effect tests.

### Phase 8 - UX Polish

Polish the shared table UX across all versions. Add responsive card layouts, turn indicators, legal move feedback, focused choice modals, animations driven by engine events, reduced motion, accessibility labels, haptics toggles, audio events, and clean round-end presentation. Do not change game rules while polishing UX.

### Phase 9 - Economy and Retention

Add cosmetic-only progression, original card backs/table themes, profile cosmetics, optional reward ads in non-competitive contexts, and achievements. Ensure no purchasable gameplay advantage exists in competitive online play. Add analytics hooks behind a provider abstraction and a privacy-safe consent layer.

### Phase 10 - Release Hardening

Run a production hardening pass. Validate all rule distributions, invariants, reconnect flows, stale commands, duplicate commands, accessibility, reduced motion, save migrations, telemetry errors, crash paths, and build reproducibility. Produce a release checklist and a known-issues report. Do not declare release-ready until all blocking tests pass.

## 21. Definition of Done

## 22. Launch Checklist

- Build from clean checkout.
- Run typecheck/lint/tests with zero blocking failures.
- Validate each deck count against manifest.
- Run a complete match in every ruleset.
- Run 2-player and maximum-player tests where applicable.
- Test draw-pile exhaustion and reshuffle.
- Test CLASH call and missed-call penalty.
- Test reconnect and duplicate command handling.
- Test reduced motion and color-blind visibility.
- Verify original art/audio/assets and licensing status.
- Verify analytics consent and privacy configuration.
- Validate cosmetic economy and store behavior.
- Create rollback build and backup of production configuration.

## Appendix A. Rule Tables

## Appendix B. Event Taxonomy

## Appendix C. Example State Fixtures

// Example: Classic Reverse in a 2-player game
before = {
activePlayerIndex: 0,
direction: 1,
discard: 'R7',
P1: ['R5'],
P2: ['B7']
}
command = { type: 'PLAY_CARD', playerId: 'P1', cardId: 'R7' }
expected = {
direction: -1,
activePlayerIndex: 1,
// equivalent to skip behavior in 2-player play
}

// Example: Mayhem elimination threshold
beforeHandSize = 24
play = 'DRAW_FIVE' // plus any stacking context
resolvedHandSize = 25
expected.eliminated = true

## Final Implementation Principle

The winning strategy is not “one giant game file.” It is one deterministic engine, five isolated ruleset modules, one shared UI shell, and a command/event boundary that lets local play, online play, AI, tests, and future variants reuse the same core. Build vertically, lock rules with tests, and let the coding agent expand the system only through explicit contracts.
Source note: This blueprint was derived from the user-provided “CLASH Digital Development Engine Blueprint,” including its Global Rules Base, Classic, Flip, Show ’Em Mayhem, All Wild, and Flex specifications. fileciteturn0file0L2-L102

| Document                      | Value                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Version                       | 1.0                                                                                                             |
| Purpose                       | Build-ready specification for a multi-version digital card game inspired by the supplied CLASH engine blueprint |
| Primary implementation target | Web/PWA using React + TypeScript + Node/WebSocket architecture (recommended)                                    |
| Coding style                  | Incremental, test-first, feature-flagged, deterministic game-state engine                                       |
| Source authority              | User-supplied CLASH Digital Development Engine Blueprint                                                        |

| In scope                                       | Out of scope until explicitly added |
| ---------------------------------------------- | ----------------------------------- |
| 2-10 player support at engine level            | Tournament ladder / ranked MMR      |
| Local and network play                         | Cross-platform account identity     |
| Five rule modules from source blueprint        | Unlicensed branded artwork          |
| Bots with deterministic decision logic         | Advanced social moderation          |
| Tutorials, settings, replayable matches        | Spectator infrastructure            |
| Persistent progression and cosmetics framework | Paid competitive advantages         |

| Area           | Source rule                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Capacity       | 2-10 players locally or over network sockets.                                                                                  |
| Base setup     | Shuffle; each player receives exactly 7 cards.                                                                                 |
| Discard setup  | Move top DrawPile card to DiscardPile; execute special action checks if it is an action/wild.                                  |
| Turn order     | Clockwise by default; ActivePlayerIndex advances by +1 modulo TotalPlayers.                                                    |
| Color match    | ProposedCard.Color equals DiscardPile.Top.Color.                                                                               |
| Value match    | ProposedCard.Value equals DiscardPile.Top.Value for 0-9, Skips, Reverses, Draw Twos.                                           |
| Wild override  | Wild or Wild_Draw_Four is always valid for matching.                                                                           |
| CLASH call     | When hand transitions from >1 to exactly 1 card, a Clash call is required. Failure before next action causes a 2-card penalty. |
| Deck depletion | If DrawPile is empty, reshuffle DiscardPile except the top card using Fisher-Yates.                                            |

| Item           | Source rule                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| Deck           | 108 cards: 76 numbered, 24 action, 8 wild.                                  |
| Numbered       | Per color: one 0 and two each of 1-9.                                       |
| Actions        | Per color: two Skips, two Reverses, two Draw Twos.                          |
| Wilds          | 4 Wild + 4 Wild Draw Four.                                                  |
| Skip           | Advance turn +2, skipping next player.                                      |
| Reverse        | Invert turn step by multiplying by -1; in 2-player games behaves like Skip. |
| Draw Two       | Next target draws 2 and turn moves over them (+2).                          |
| Wild           | Require color declaration and update active color.                          |
| Wild Draw Four | Select color, target draws 4, then skip.                                    |

| Area                 | Source rule                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| Dual deck state      | DeckSide enum: LIGHT_SIDE or DARK_SIDE. Card structs hold both sides.         |
| Flip trigger         | Playing a Flip toggles DeckSide and immediately changes rules/visuals.        |
| Light colors         | Pink, Teal, Purple, Orange.                                                   |
| Light actions        | 8 Skips, 8 Reverses, 8 Draw Ones, 8 Flips, 4 Wilds, 4 Wild Draw Twos.         |
| Light Draw One       | Target draws 1 and loses action.                                              |
| Light Wild Draw Two  | Change active color, target draws 2, target turn skipped.                     |
| Dark colors          | Dark Pink, Dark Teal, Dark Purple, Dark Orange.                               |
| Dark actions         | 8 Skips, 8 Reverses, 8 Draw Fives, 8 Flips, 4 Wilds, 4 Wild Draw Everyones.   |
| Dark Draw Five       | Target draws 5 and loses action.                                              |
| Dark Skip Everyone   | Clear turn queue; play control returns instantly to card player.              |
| Dark Wild Draw Color | Active player chooses a color; target draws continuously until they match it. |

| Area                  | Source rule                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Deck                  | 168 cards.                                                                                                                                             |
| Additions             | 8 Draw Four, 8 Discard All, 4 Wild Draw Six, 4 Wild Draw Ten, 4 Wild Reverse Skip.                                                                     |
| Stacking              | Draw penalties +2/+4/+6/+10 can pass iteratively when matching or higher cards are played; cumulative penalty lands on first player unable to respond. |
| Elimination threshold | After every draw, if hand size >=25, player is immediately eliminated.                                                                                 |
| 7 rule                | Playing 7 triggers mandatory choice to swap hands with any player.                                                                                     |
| 0 rule                | Playing 0 rotates all hands sequentially down the turn queue.                                                                                          |
| Wild Draw Six/Ten     | Change active color and add severe draw penalties to stacking vector.                                                                                  |
| Discard All           | Immediately discard every card of matching color from the player hand.                                                                                 |

| Area                 | Source rule                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Deck                 | 112 cards; no numbered or color-matched cards; every asset is structurally Wild.                                      |
| Composition          | 48 Standard Wilds, 24 Wild Target Draw Twos, 16 Wild Skips, 12 Wild Reverses, 8 Wild Double Skips, 4 Wild Draw Fours. |
| Wild Target Draw Two | Active player targets any player index globally; target draws 2.                                                      |
| Wild Double Skip     | Advance turn index +3, eliminating the next two consecutive active players.                                           |

| Area           | Source rule                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Card structure | Primary symbols plus secondary triangle indicators containing alternate color/action matrix.                 |
| Power          | Public FlexPowerTracker boolean. Using a flex action consumes the token until globally reset.                |
| Flex Number    | Can validate through secondary triangle matrix if primary color match fails.                                 |
| Flex Draw Two  | Standard: next player draws 2. Flex: skip draw penalty and force all other players to draw 1 simultaneously. |
| Flex Skip      | Standard: skip next player. Flex: skip all opponents and immediately grant active player another turn.       |

| Mode                | Recommended behavior                                                  |
| ------------------- | --------------------------------------------------------------------- |
| Local vs Bots       | 2-10 seats, configurable human/bot mix, no network dependency.        |
| Local Pass-and-Play | 2-10 human seats on one device; hide private hands between turns.     |
| Private Online      | Room code / share link; authoritative host/server state.              |
| Public Matchmaking  | Phase after core stability; separate service boundary.                |
| Tutorial            | Ruleset-specific scripted match with undo/replay-safe state fixtures. |

| Command                  | Purpose                                       | Validation                                   |
| ------------------------ | --------------------------------------------- | -------------------------------------------- |
| START_GAME               | Create deterministic initial state            | Player count + version config                |
| PLAY_CARD                | Play one card from current hand               | Active player, card ownership, legal move    |
| DRAW_CARD                | Draw required number / normal draw            | Correct phase and penalty context            |
| CALL_CLASH               | Declare CLASH                                 | Player has exactly one card / allowed timing |
| CHALLENGE_WILD_DRAW_FOUR | Optional challenge hook                       | Only if enabled by version config            |
| CHOOSE_COLOR             | Resolve a wild choice                         | Pending choice belongs to player             |
| CHOOSE_TARGET            | Resolve target selection                      | Target must be eligible                      |
| USE_FLEX                 | Consume flex token and apply alternate action | Flex available + card supports flex          |
| SWAP_HAND                | Resolve 7-hand-swap choice                    | Required only in Mayhem                      |
| END_TURN                 | Explicit transition where needed              | Only when state requests it                  |

| Screen            | Required elements                                                   |
| ----------------- | ------------------------------------------------------------------- |
| Splash            | Brand mark, fast load, offline asset prefetch                       |
| Home              | Play, rule versions, profile, settings, cosmetics                   |
| Version Select    | Version cards, difficulty/complexity indicator, learn rules         |
| Lobby             | Player slots, host controls, privacy, start                         |
| Game Table        | Top discard, player hand, draw pile, turn indicator, opponent seats |
| Choice Modal      | Color, target, swap, flex choices depending on effect               |
| CLASH State       | Persistent but unobtrusive CLASH button and feedback                |
| Score/Result      | Winner, reason, statistics, rematch                                 |
| Rules/How to Play | Version-specific cards and examples                                 |
| Settings          | Sound, vibration, accessibility, animation intensity, language      |

| Token         | Recommendation                                                                               |
| ------------- | -------------------------------------------------------------------------------------------- |
| Cards         | High-contrast white/neutral base with version-specific accent system                         |
| Typography    | Rounded display for headings, highly legible UI sans for numbers                             |
| Motion        | 120-250 ms micro-interactions; 300-600 ms major reveals; reduced-motion mode                 |
| Feedback      | Subtle glow, scale, particles; never block the next action unnecessarily                     |
| Accessibility | Color-blind palettes, text labels, large touch targets, screen-reader names where applicable |

| Tier         | Behavior                                                                           |
| ------------ | ---------------------------------------------------------------------------------- |
| Easy         | Random legal move; simple target selection                                         |
| Normal       | Prefer getting rid of high-risk cards; basic penalty awareness                     |
| Hard         | Track opponents’ visible hand size, likely colors, pending stack, and target value |
| Chaos/Mayhem | Aggressive penalty stacking, elimination awareness, hand-swap optimization         |

| System              | Recommended model                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Cosmetics           | Card backs, table themes, emotes, profile frames, sound packs                                     |
| Premium themes      | One-time cosmetic packs or season-style collections                                               |
| Ads                 | Optional reward ads in solo/local progression; never interrupt active turns                       |
| Battle/season track | Cosmetic-only progression                                                                         |
| No-pay advantage    | No purchasable draw, wild, extra turn, or hidden-information advantage in online competitive play |
| Events              | Time-limited cosmetic events and challenge tracks                                                 |

| Event                   | Purpose                     |
| ----------------------- | --------------------------- |
| match_started           | Mode/version funnel         |
| turn_completed          | Pacing and drop-off         |
| card_played             | Rule engagement and balance |
| uno_called / uno_missed | UX clarity                  |
| round_completed         | Retention signal            |
| tutorial_completed      | Learning effectiveness      |
| error_game_desync       | Reliability monitoring      |
| purchase_completed      | Revenue analysis            |

| Layer          | Minimum target                                           |
| -------------- | -------------------------------------------------------- |
| Unit           | Every rule effect and validator                          |
| Property-based | Card conservation, no duplicate cards, turn reachability |
| Integration    | Full round sequences per version                         |
| Network        | Reconnect, duplicate command, latency simulation         |
| UI             | Choice modals, hand interaction, reduced motion          |
| Snapshot       | State fixtures and event sequences                       |
| Smoke          | Boot, create match, play full round, rematch             |

| Phase                      | Deliverable                                        | Exit criteria                                    |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| 0 - Foundation             | Monorepo, TypeScript, engine package, tests        | All packages build; CI green                     |
| 1 - Core engine            | Setup, turn flow, draw, discard, common validation | Deterministic Classic skeleton passes core tests |
| 2 - Classic vertical slice | Complete Classic UI + bot                          | Full match from home to result works locally     |
| 3 - Multiplayer            | Rooms, WebSocket, authoritative state              | Two devices stay synchronized                    |
| 4 - Flip                   | Dual-side cards, flip effects, UI transition       | Light/dark rules pass fixtures                   |
| 5 - Mayhem                 | Stacking, elimination, 7/0, extreme actions        | Stress fixtures pass                             |
| 6 - All Wild               | Target draws, skips, reverses                      | Full round stable                                |
| 7 - Flex                   | Primary/secondary matrix + token                   | Flex rules deterministic                         |
| 8 - Polish                 | Audio, animation, accessibility                    | UX QA signoff                                    |
| 9 - Monetization           | Cosmetics and optional ads                         | No pay-to-win vectors                            |
| 10 - Release               | Telemetry, crash handling, build pipeline          | Release candidate passes launch checklist        |

| Area          | Done when                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------ |
| Rules         | Every source-defined rule has a corresponding engine test and human-readable rule entry.   |
| Engine        | Pure deterministic reducer + invariants + event output.                                    |
| UI            | All commands have a visible trigger or documented automatic trigger; no hidden input path. |
| Multiplayer   | Authoritative server rejects illegal commands and clients resync safely.                   |
| AI            | Bots complete matches using only legal command paths.                                      |
| Accessibility | Non-color cues and reduced motion are functional.                                          |
| QA            | Required edge-case suite passes for all versions.                                          |
| Monetization  | Cosmetic/optional only; no competitive advantage.                                          |
| Legal/IP      | Commercial asset and naming strategy reviewed before public launch.                        |
| Observability | Critical command failures and desyncs produce actionable diagnostics.                      |

| Version        | Deck size                            | Key state                                 | Distinctive mechanics                                    |
| -------------- | ------------------------------------ | ----------------------------------------- | -------------------------------------------------------- |
| Classic        | 108                                  | activeColor, direction, pendingDraw       | Skip, Reverse, Draw Two, Wild, Wild Draw Four            |
| Flip           | Source-defined dual side composition | deckSide, activeColor, direction          | Flip, Draw One/Draw Five, Skip Everyone, Wild Draw Color |
| Show Em Mayhem | 168                                  | pendingDraw, stacking context, eliminated | stacking, 25-card elimination, 7/0, severe wilds         |
| All Wild       | 112                                  | target selection, direction               | target Draw Two, Double Skip, all-wild legality          |
| Flex           | Source-defined flex matrix           | flexPowerAvailable, primary/secondary     | alternate actions and colors                             |

| Event             | Payload examples         |
| ----------------- | ------------------------ |
| GAME_STARTED      | gameId, version, players |
| CARD_DEALT        | playerId, count          |
| CARD_PLAYED       | playerId, cardId         |
| COLOR_CHOSEN      | playerId, color          |
| TARGET_CHOSEN     | playerId, targetId       |
| CARD_DRAWN        | playerId, count          |
| STACK_UPDATED     | pendingDraw, sourceCard  |
| TURN_CHANGED      | from, to, direction      |
| CLASH_PENDING     | playerId                 |
| CLASH_CALLED      | playerId                 |
| CLASH_PENALTY     | playerId, count          |
| FLIP_TRIGGERED    | playerId, side           |
| FLEX_USED         | playerId, cardId         |
| PLAYER_ELIMINATED | playerId, reason         |
| ROUND_ENDED       | winnerId, standings      |
