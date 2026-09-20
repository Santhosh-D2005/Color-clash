import { createRng, type GameState, type GameVersion } from '@colorclash/shared';
import { assertInvariants, createMatch, buildPlayerView } from '@colorclash/game-engine';
import { runBotTurns } from '@colorclash/ai/driver';
import { describe, expect, it } from '@colorclash/test-fixtures';

/**
 * Property-based layer — §16.1: "Card conservation, no duplicate cards, turn
 * reachability".
 *
 * Every assertion runs against fully seeded matches driven end to end by bots,
 * across all five rulesets and player counts from 2 to 10, so a rule that
 * leaks a card shows up here rather than in production.
 */

const VERSIONS: GameVersion[] = ['CLASSIC', 'FLIP', 'MAYHEM', 'ALL_WILD', 'FLEX'];

function totalCards(state: GameState): number {
  return (
    state.players.reduce((n, p) => n + p.hand.length, 0) +
    state.drawPile.length +
    state.discardPile.length
  );
}

function noDuplicates(state: GameState): boolean {
  const seen = new Set<string>();
  const zones = [...state.players.flatMap((p) => p.hand), ...state.drawPile, ...state.discardPile];
  for (const id of zones) {
    if (seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

describe('properties — card conservation and reachability (§16.1)', () => {
  it('card count is invariant across a whole match, every version', () => {
    for (const version of VERSIONS) {
      for (let seed = 0; seed < 12; seed++) {
        const rng = createRng(`prop-${version}-${seed}`);
        const players = ['A', 'B', 'C', 'D'].map((id) => ({
          id,
          name: id,
          isBot: true,
          botTier: 'NORMAL' as const,
        }));
        const { state } = createMatch({ gameId: 'g', version, seed: `${seed}`, players }, rng);
        const deckSize = Object.keys(state.cards).length;
        expect(totalCards(state)).toBe(deckSize);

        const out = runBotTurns(state, rng, {
          maxSteps: 4000,
          onStep: (s) => {
            if (totalCards(s) !== deckSize) {
              throw new Error(
                `${version} seed ${seed}: card count drifted to ${totalCards(s)} (expected ${deckSize})`,
              );
            }
          },
        });
        expect(totalCards(out.state)).toBe(deckSize);
        expect(noDuplicates(out.state)).toBe(true);
        assertInvariants(out.state);
      }
    }
  });

  it('every match reaches a terminal state without stalling', () => {
    for (const version of VERSIONS) {
      for (let seed = 0; seed < 10; seed++) {
        const rng = createRng(`term-${version}-${seed}`);
        const players = ['A', 'B', 'C', 'D'].map((id) => ({
          id,
          name: id,
          isBot: true,
          botTier: 'NORMAL' as const,
        }));
        const { state } = createMatch({ gameId: 'g', version, seed: `${seed}`, players }, rng);
        const out = runBotTurns(state, rng, { maxSteps: 6000 });
        expect(out.state.status).toBe('MATCH_END');
        expect(out.state.winnerId).toBeDefined();
      }
    }
  });

  it('handles every supported player count, 2 through 10 (SOURCE §2.1)', () => {
    for (const version of VERSIONS) {
      for (let count = 2; count <= 10; count++) {
        const rng = createRng(`count-${version}-${count}`);
        const players = Array.from({ length: count }, (_, i) => ({
          id: `P${i + 1}`,
          name: `P${i + 1}`,
          isBot: true,
          botTier: 'NORMAL' as const,
        }));
        const { state, events } = createMatch(
          { gameId: 'g', version, seed: `c${count}`, players },
          rng,
        );
        // §7.1 step 3: deal exactly 7 to every player. Assert the deal itself,
        // because step 5 (the opening action) may legitimately add cards to the
        // first seat before anyone has played.
        const dealt = events.filter((e) => e.type === 'CARD_DEALT');
        expect(dealt).toHaveLength(count);
        expect(dealt.every((e) => e.type === 'CARD_DEALT' && e.count === 7)).toBe(true);
        for (const p of state.players) expect(p.hand.length).toBeGreaterThanOrEqual(7);
        const out = runBotTurns(state, rng, { maxSteps: 8000 });
        expect(out.state.status).toBe('MATCH_END');
        assertInvariants(out.state);
      }
    }
  });

  it('is fully deterministic — the same seed replays identically', () => {
    for (const version of VERSIONS) {
      const run = () => {
        const rng = createRng(`det-${version}`);
        const players = ['A', 'B', 'C'].map((id) => ({
          id,
          name: id,
          isBot: true,
          botTier: 'HARD' as const,
        }));
        const { state } = createMatch({ gameId: 'g', version, seed: 'det', players }, rng);
        const out = runBotTurns(state, rng, { maxSteps: 5000 });
        return {
          winner: out.state.winnerId,
          seq: out.state.seq,
          events: out.events.length,
          discard: out.state.discardPile.join(','),
        };
      };
      expect(run()).toEqual(run());
    }
  });

  it("a player view never exposes another player's hand (§15)", () => {
    for (const version of VERSIONS) {
      const rng = createRng(`view-${version}`);
      const players = ['A', 'B', 'C'].map((id) => ({
        id,
        name: id,
        isBot: true,
        botTier: 'NORMAL' as const,
      }));
      const { state } = createMatch({ gameId: 'g', version, seed: 'v', players }, rng);
      const view = buildPlayerView(state, 'A');

      // Only our own hand plus the visible top discard are identifiable.
      const identifiable = new Set(Object.keys(view.cards));
      const ownHand = new Set(view.yourHand);
      for (const id of identifiable) {
        const isOwn = ownHand.has(id);
        const isTop = id === view.topCardId;
        expect(isOwn || isTop).toBe(true);
      }
      // Opponents are reduced to a count.
      const b = view.players.find((p) => p.id === 'B')!;
      expect(b.handCount).toBe(7);
      expect((b as unknown as { hand?: string[] }).hand).toBeUndefined();
    }
  });

  it('bots never receive information a human client would not', () => {
    // Structural guarantee: the bot API takes a PlayerView, and PlayerView is
    // exactly what a networked client receives. This test pins the shape so a
    // future change that widens it fails loudly (§11.2).
    const rng = createRng('ai-safety');
    const players = ['A', 'B'].map((id) => ({
      id,
      name: id,
      isBot: true,
      botTier: 'CHAOS' as const,
    }));
    const { state } = createMatch({ gameId: 'g', version: 'CLASSIC', seed: 's', players }, rng);
    const view = buildPlayerView(state, 'A');
    const keys = Object.keys(view).sort();
    expect(keys).not.toContain('drawPile');
    expect(keys).not.toContain('cardsById');
    expect(view.drawPileCount).toBeGreaterThan(0);
  });
});
