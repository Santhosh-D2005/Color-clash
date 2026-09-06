import type { GameVersion } from '@colorclash/shared';

/**
 * Player-facing rules copy — one sheet per mode.
 *
 * This describes what the engine already does; it does not define anything.
 * Every line here corresponds to behaviour implemented in
 * `packages/game-engine/src/versions/*.ts`, and where the source blueprint was
 * silent the sheet says so and names the rule flag, rather than presenting a
 * default as if it were a law.
 *
 * Kept in game-content rather than the client so the same text can back a rules
 * screen, a tooltip, or a printed sheet without being written twice.
 */

export type RuleSection = {
  heading: string;
  /** Short, scannable lines. Not paragraphs — this is read on a phone. */
  points: string[];
};

export type RuleSheet = {
  version: GameVersion;
  /** One sentence: what winning looks like. */
  objective: string;
  /** Four to six sections, in reading order. */
  sections: RuleSection[];
};

/** Shared rules every mode inherits. Rendered once, above the per-mode sheet. */
export const CORE_RULES: RuleSection[] = [
  {
    heading: 'Your turn',
    points: [
      'Play one card that matches the pile, or draw one.',
      'Drew something playable? Play it, or tap PASS.',
      'Playable cards glow gold. Everything else dims — tapping it costs you nothing.',
      'The active colour is named in text under the pile, not just shown as a colour.',
    ],
  },
  {
    heading: 'Calling Clash',
    points: [
      'The moment you play down to one card, the CLASH button lights up.',
      'Call it before your next action or you draw a penalty.',
      'Opponents down to one card show a CLASH tag on their seat.',
    ],
  },
  {
    heading: 'Matching',
    points: [
      'A card matches if the colour matches, or the number or symbol matches.',
      'Wild cards can always be played, and you name the colour that follows.',
    ],
  },
];

const CLASSIC: RuleSheet = {
  version: 'CLASSIC',
  objective: 'Be the first to empty your hand.',
  sections: [
    {
      heading: 'The deck',
      points: [
        '108 cards in four colours.',
        'One 0 and two each of 1-9 per colour.',
        'Two each of Skip, Reverse and Draw Two per colour.',
        'Four Wilds and four Wild Draw Fours.',
      ],
    },
    {
      heading: 'Action cards',
      points: [
        'Skip — the next player loses their turn.',
        'Reverse — play changes direction. With two players it acts as a Skip.',
        'Draw Two — the next player draws two and loses their turn.',
        'Wild — choose the next colour.',
        'Wild Draw Four — choose the colour; the next player draws four and loses their turn.',
      ],
    },
    {
      heading: 'Stacking',
      points: [
        'Off by default here, matching the printed rules.',
        'Turn it on in the lobby if your table plays that way.',
      ],
    },
    {
      heading: 'Ending a round',
      points: [
        'First empty hand wins the round.',
        'The winner banks the value of every card still held by everyone else.',
      ],
    },
  ],
};

const FLIPSTORM: RuleSheet = {
  version: 'FLIP',
  objective: 'Empty your hand — on whichever side of the deck you end up on.',
  sections: [
    {
      heading: 'Two sides, one deck',
      points: [
        'Every card is printed on both faces. Only one side is in play at a time.',
        'Light side: Pink, Teal, Purple, Orange.',
        'Dark side: the darker four. Same colours, harder cards.',
        'You can see your own cards. You cannot see the other side of anyone else’s.',
      ],
    },
    {
      heading: 'The Flip card',
      points: [
        'Playing a Flip turns the whole deck over — draw pile, discard and every hand.',
        'The card that was in play becomes its other face, and that face is now the match.',
      ],
    },
    {
      heading: 'Light side actions',
      points: ['Skip. Reverse. Draw One. Flip. Wild. Wild Draw Two.'],
    },
    {
      heading: 'Dark side actions',
      points: [
        'Draw Five — brutal, and stackable if stacking is on.',
        'Skip Everyone — everyone else is skipped and the turn returns to you.',
        'Wild Draw Colour — name a colour; the next player draws until they get one.',
      ],
    },
    {
      heading: 'What the source left open',
      points: [
        'Which dark card backs which light card is not defined by the source spec.',
        'This build pairs same-colour, same-number by default (rule flag RF-010).',
      ],
    },
  ],
};

const MAYHEM: RuleSheet = {
  version: 'MAYHEM',
  objective: 'Empty your hand before the table buries you.',
  sections: [
    {
      heading: 'Stacking is the whole game',
      points: [
        'A draw card can be answered with a draw card worth the same or more.',
        'The stack keeps growing and moving until someone cannot answer.',
        'That player draws the entire stack and loses their turn.',
        'Colour does not matter when answering — only the number of cards.',
      ],
    },
    {
      heading: 'The big cards',
      points: [
        'Draw Four, Wild Draw Six, Wild Draw Ten.',
        'Discard All — dump every card you hold of the active colour.',
        'Skip Everyone — the turn comes straight back to you.',
        'Wild Reverse Skip — turn direction flips and the next player is skipped.',
      ],
    },
    {
      heading: 'Elimination',
      points: [
        'Reach 25 cards in hand and you are out of the round immediately.',
        'The check runs after every single draw, so a big stack can end you mid-turn.',
        'Last player standing wins if nobody empties their hand first.',
      ],
    },
    {
      heading: 'Sevens and zeros',
      points: [
        'Play a 7 and you swap hands with a player you choose.',
        'Play a 0 and every hand rotates in the current direction of play.',
      ],
    },
  ],
};

const WILD_RUSH: RuleSheet = {
  version: 'ALL_WILD',
  objective: 'Empty your hand. Every card can be played, so speed is everything.',
  sections: [
    {
      heading: 'No matching',
      points: [
        'Every card in the deck is structurally wild.',
        'Any card is legal on any turn. There is nothing to match.',
        'So the only question is which card hurts them most, right now.',
      ],
    },
    {
      heading: 'The cards',
      points: [
        'Wild — plain, no effect.',
        'Wild Target Draw Two — pick anyone at the table; they draw two.',
        'Wild Skip — skip the next player.',
        'Wild Double Skip — skip the next two.',
        'Wild Reverse — turn play around.',
        'Wild Draw Four — the next player draws four and is skipped.',
      ],
    },
    {
      heading: 'Colour',
      points: [
        'Because nothing matches on colour, this mode does not stop to ask you for one.',
        'The pile still shows a colour so the table reads clearly — it just has no effect on play.',
        'Recorded as rule flag RF-011.',
      ],
    },
  ],
};

const FREESTYLE: RuleSheet = {
  version: 'FLEX',
  objective: 'Empty your hand, with one rule bent your way.',
  sections: [
    {
      heading: 'Two cards in one',
      points: [
        'Every coloured card carries a second symbol in the corner triangle.',
        'That secondary face is an alternative you can choose instead of the printed one.',
      ],
    },
    {
      heading: 'The Flex token',
      points: [
        'One token per round, shared by the whole table. First to spend it, gets it.',
        'Spending it upgrades the card you are playing to its flex behaviour.',
        'Flex Skip skips everyone and returns the turn to you.',
        'Flex Draw Two makes every other player draw one instead.',
        'The HUD shows whether the token is still available.',
      ],
    },
    {
      heading: 'When the token comes back',
      points: [
        'At the start of each round. The source spec says only "until globally reset".',
        'Recorded as rule flag RF-012 — the reset point is a documented choice, not a stated rule.',
      ],
    },
  ],
};

export const RULE_SHEETS: Record<GameVersion, RuleSheet> = {
  CLASSIC,
  FLIP: FLIPSTORM,
  MAYHEM,
  ALL_WILD: WILD_RUSH,
  FLEX: FREESTYLE,
};

export function rulesFor(version: GameVersion): RuleSheet {
  return RULE_SHEETS[version];
}
