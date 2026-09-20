import type { Card, CardSideData, DeckSide } from '@colorclash/shared';
import { CARD_GLYPH, CARD_LABEL, COLOR_HEX, COLOR_LABEL } from '@colorclash/game-content';
import { asset } from '../assets/index.js';

/**
 * Card renderer.
 *
 * Faces are drawn in CSS rather than shipped as 168 bitmaps: one element, one
 * face colour, one shard motif and a text glyph. The visual language is the
 * project's own — see the `.card-inner` rules in app.css and the vector
 * sources in tools/gen-brand.ts. Nothing here is traced from another product.
 *
 * §9.2: "All important game outcomes have a non-color cue" — every face carries
 * its value or action glyph as text, and an aria-label naming colour and action.
 */

export function faceOf(card: Card, deckSide?: DeckSide): CardSideData {
  if (card.sides) return deckSide === 'DARK_SIDE' ? card.sides.dark : card.sides.light;
  return {
    kind: card.kind,
    color: card.primaryColor,
    value: typeof card.value === 'number' ? card.value : undefined,
  };
}

export function describeCard(card: Card, deckSide?: DeckSide): string {
  const f = faceOf(card, deckSide);
  const color = f.color ? (COLOR_LABEL[f.color] ?? f.color) : 'Wild';
  const what = f.kind === 'NUMBER' ? String(f.value ?? 0) : CARD_LABEL[f.kind];
  return `${color} ${what}`;
}

export function CardFace({
  card,
  deckSide,
  size = 'md',
  className = '',
  showFlex = false,
}: {
  card: Card;
  deckSide?: DeckSide;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showFlex?: boolean;
}) {
  const f = faceOf(card, deckSide);
  const isWild = !f.color;
  const isDark = Boolean(f.color?.startsWith('DARK_'));
  const glyph = f.kind === 'NUMBER' ? String(f.value ?? 0) : CARD_GLYPH[f.kind];
  const corner = f.kind === 'NUMBER' ? String(f.value ?? 0) : CARD_GLYPH[f.kind];
  const long = glyph.length > 2;

  return (
    <div
      className={`card ${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''} ${className}`}
      role="img"
      aria-label={describeCard(card, deckSide)}
      title={describeCard(card, deckSide)}
    >
      <div
        className={`card-inner${isWild ? ' wild' : ''}${isDark ? ' dark-face' : ''}`}
        style={{ ['--face' as string]: f.color ? (COLOR_HEX[f.color] ?? '#333') : '#1b1b22' }}
      >
        <span className={`card-glyph${long ? ' small' : ''}`}>{glyph}</span>
        <span className="card-corner tl">{corner}</span>
        <span className="card-corner br">{corner}</span>
      </div>
      {showFlex && card.flex ? (
        <i
          className="card-flex-tri"
          style={{ ['--flex' as string]: COLOR_HEX[card.flex.secondaryColor] ?? '#fff' }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const width = size === 'lg' ? 84 : size === 'sm' ? 40 : 62;
  return (
    <img
      className="card-back-img"
      src={asset('card_back')}
      alt=""
      style={{ width }}
      draggable={false}
    />
  );
}
