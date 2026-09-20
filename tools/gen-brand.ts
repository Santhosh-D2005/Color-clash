/**
 * Generates every image in the game from original vector sources.
 *
 * This file *is* the artwork. Each asset is authored here as SVG built from
 * primitives — polygons, arcs, gradients, text in a generic system stack — and
 * rasterised with sharp. Nothing is traced, sampled or copied from any other
 * product, and the whole visual identity can be regenerated from scratch by
 * running this one script. That is the point: the identity has to be provably
 * ours, not merely different.
 *
 * The COLOR CLASH mark is a four-shard prism: four coloured triangles meeting
 * at a common vertex with a hard diagonal split. Every other asset is built
 * from that one shape rule — shards, chevrons, and the 12-degree shear that
 * runs through the whole set.
 *
 * Output sizes match the previous set exactly so no layout shifts.
 *
 *   npx tsx tools/gen-brand.ts
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const OUT = resolve(import.meta.dirname, '../apps/client/src/assets');
const PWA_ICONS = resolve(import.meta.dirname, '../apps/client/pwa/icons');
const RESOURCES = resolve(import.meta.dirname, '../resources');

/* ------------------------------------------------------------------ */
/* Palette — the brand's own, defined here and nowhere else            */
/* ------------------------------------------------------------------ */

export const BRAND = {
  /** The four clash colours. Deliberately shifted off primary hues. */
  shard: ['#e2483f', '#f2b134', '#2f9e5e', '#2f7fd4'],
  shardDark: ['#8e211b', '#a06b0d', '#155f34', '#134d84'],
  ink: '#070f20',
  deep: '#0d1a33',
  mid: '#16294b',
  rim: '#2b4a80',
  gold: '#f0b840',
  goldDeep: '#a06b0d',
  paper: '#f4f7fb',
  text: '#dce6f5',
  dim: '#8fa4c6',
} as const;

const FONT = "'Trebuchet MS','DejaVu Sans',Verdana,sans-serif";

/* ------------------------------------------------------------------ */
/* SVG helpers                                                         */
/* ------------------------------------------------------------------ */

function svg(w: number, h: number, body: string, defs = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${defs}</defs>
${body}
</svg>`;
}

function linear(id: string, from: string, to: string, angle = 90): string {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = 0.5 - Math.cos(rad) / 2;
  const y1 = 0.5 - Math.sin(rad) / 2;
  const x2 = 0.5 + Math.cos(rad) / 2;
  const y2 = 0.5 + Math.sin(rad) / 2;
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`;
}

function radial(id: string, from: string, to: string): string {
  return `<radialGradient id="${id}" cx="0.5" cy="0.42" r="0.62">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient>`;
}

/** The core mark: four shards meeting at the centre of a square. */
function prism(cx: number, cy: number, r: number, rot = 0, opacity = 1): string {
  const pts = (a: number, b: number) => {
    const p = (deg: number) => {
      const t = ((deg + rot) * Math.PI) / 180;
      return `${(cx + Math.cos(t) * r).toFixed(2)},${(cy + Math.sin(t) * r).toFixed(2)}`;
    };
    return `${cx},${cy} ${p(a)} ${p((a + b) / 2)} ${p(b)}`;
  };
  return [0, 1, 2, 3]
    .map(
      (i) =>
        `<polygon points="${pts(i * 90 - 45, i * 90 + 45)}" fill="${BRAND.shard[i]}" opacity="${opacity}"/>`,
    )
    .join('');
}

/** A single shard, used as a repeating motif. */
function shard(x: number, y: number, w: number, h: number, fill: string, skew = 0.22): string {
  const s = w * skew;
  return `<polygon points="${x + s},${y} ${x + w},${y} ${x + w - s},${y + h} ${x},${y + h}" fill="${fill}"/>`;
}

/* ------------------------------------------------------------------ */
/* Individual assets                                                   */
/* ------------------------------------------------------------------ */

const A: Record<string, () => string> = {
  /* ---- identity ---- */

  logo: () => {
    // Exact Comic Pop-Art Logo (Panels 1, 2, 3)
    const starburstPts = [
      [291, 15],
      [328, 62],
      [385, 30],
      [402, 88],
      [460, 75],
      [455, 135],
      [512, 142],
      [485, 198],
      [538, 235],
      [488, 268],
      [520, 320],
      [458, 332],
      [465, 388],
      [405, 375],
      [382, 428],
      [328, 395],
      [291, 440],
      [254, 395],
      [200, 428],
      [177, 375],
      [117, 388],
      [124, 332],
      [62, 320],
      [94, 268],
      [44, 235],
      [97, 198],
      [70, 142],
      [127, 135],
      [122, 75],
      [180, 88],
      [197, 30],
      [254, 62],
    ]
      .map(([x, y = 0]) => `${x},${y * 0.88}`)
      .join(' ');

    return svg(
      582,
      414,
      `<!-- 3D Shadow for starburst -->
      <polygon points="${starburstPts}" fill="#000000" transform="translate(6, 8)"/>
      <!-- Cyan Comic Starburst -->
      <polygon points="${starburstPts}" fill="#00b4d8" stroke="#000000" stroke-width="7"/>
      <!-- Inner starburst accent -->
      <polygon points="${starburstPts}" fill="#00e5ff" transform="scale(0.88) translate(38, 26)" opacity="0.75"/>

      <!-- "COLOR-" 3D Extruded Black Shadow -->
      <text x="299" y="180" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="5" transform="rotate(-3 291 170)">COLOR-</text>
      <text x="296" y="177" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="5" transform="rotate(-3 291 170)">COLOR-</text>
      <!-- "COLOR-" Foreground in Comic Yellow -->
      <text x="291" y="170" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900"
            fill="#ffd600" stroke="#000000" stroke-width="9" paint-order="stroke fill" text-anchor="middle" letter-spacing="5" transform="rotate(-3 291 170)">COLOR-</text>

      <!-- "CLASH" 3D Extruded Black Shadow -->
      <text x="299" y="292" font-family="Impact, Arial Black, sans-serif" font-size="136" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="6" transform="rotate(-1 291 280)">CLASH</text>
      <text x="296" y="288" font-family="Impact, Arial Black, sans-serif" font-size="136" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="6" transform="rotate(-1 291 280)">CLASH</text>
      <!-- "CLASH" Foreground in Comic Red -->
      <text x="291" y="280" font-family="Impact, Arial Black, sans-serif" font-size="136" font-weight="900"
            fill="#ff204e" stroke="#000000" stroke-width="10" paint-order="stroke fill" text-anchor="middle" letter-spacing="6" transform="rotate(-1 291 280)">CLASH</text>

      <!-- Comic Subtitle Ribbon Banner -->
      <!-- Shadow -->
      <polygon points="62,342 522,342 506,398 78,398" fill="#000000"/>
      <!-- Ribbon Left fold -->
      <polygon points="42,365 72,345 72,390 42,380" fill="#d9d9d9" stroke="#000000" stroke-width="4"/>
      <!-- Ribbon Right fold -->
      <polygon points="540,365 510,345 510,390 540,380" fill="#d9d9d9" stroke="#000000" stroke-width="4"/>
      <!-- Ribbon Front White Card -->
      <polygon points="56,335 526,335 512,392 70,392" fill="#ffffff" stroke="#000000" stroke-width="6"/>
      <text x="291" y="375" font-family="Impact, Arial Black, sans-serif" font-size="28" font-weight="bold"
            fill="#000000" text-anchor="middle" letter-spacing="3">SAME COLORS. NEW BATTLES!</text>`,
    );
  },

  splash_full: () =>
    svg(
      822,
      594,
      `<rect width="822" height="594" fill="#0096c7"/>
      <g transform="translate(120, 90) scale(1.05)">
        <text x="291" y="170" font-family="Impact, Arial Black, sans-serif" font-size="112" font-weight="900"
              fill="#ffd600" stroke="#000000" stroke-width="9" paint-order="stroke fill" text-anchor="middle" letter-spacing="5">COLOR-</text>
        <text x="291" y="280" font-family="Impact, Arial Black, sans-serif" font-size="136" font-weight="900"
              fill="#ff204e" stroke="#000000" stroke-width="10" paint-order="stroke fill" text-anchor="middle" letter-spacing="6">CLASH</text>
      </g>`,
    ),

  /** The declaration button. Replaces the old branded call entirely. */
  btn_clash: () =>
    svg(
      496,
      220,
      `<rect x="14" y="22" width="468" height="180" rx="36" fill="#000000"/>
      <rect x="10" y="12" width="468" height="180" rx="36" fill="#ffd600" stroke="#000000" stroke-width="8"/>
      <rect x="24" y="24" width="440" height="70" rx="20" fill="#ffffff44"/>
      <text x="248" y="138" font-family="Impact, Arial Black, sans-serif" font-size="108" font-weight="900"
            fill="#ff204e" stroke="#000000" stroke-width="9" paint-order="stroke fill" text-anchor="middle" letter-spacing="8">CLASH!</text>`,
    ),

  card_back: () =>
    svg(
      280,
      370,
      `<rect width="280" height="370" rx="20" fill="#ffffff" stroke="#000000" stroke-width="8"/>
      <rect x="14" y="14" width="252" height="342" rx="14" fill="#002b5c" stroke="#000000" stroke-width="4"/>
      <circle cx="140" cy="185" r="72" fill="#ffd600" stroke="#000000" stroke-width="6"/>
      <circle cx="140" cy="185" r="48" fill="#ff204e" stroke="#000000" stroke-width="5"/>
      <text x="140" y="200" font-family="Impact, Arial Black, sans-serif" font-size="44" font-weight="bold" fill="#ffffff" stroke="#000000" stroke-width="3" text-anchor="middle">CC</text>`,
    ),

  banner_youwin: () =>
    svg(
      784,
      164,
      `<polygon points="40,24 744,24 714,148 70,148" fill="#000000"/>
      <polygon points="30,14 734,14 704,138 60,138" fill="#ffd600" stroke="#000000" stroke-width="7"/>
      <text x="382" y="108" font-family="Impact, Arial Black, sans-serif" font-size="96" font-weight="900"
            fill="#000000" text-anchor="middle" letter-spacing="8">YOU WIN!</text>`,
    ),

  /* ---- HUD icons ---- */

  icon_clock: () =>
    svg(
      112,
      112,
      `<circle cx="56" cy="56" r="46" fill="${BRAND.deep}" stroke="${BRAND.text}" stroke-width="8"/>
      <path d="M56 28 L56 58 L78 70" fill="none" stroke="${BRAND.text}"
            stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="56" cy="56" r="6" fill="${BRAND.gold}"/>`,
    ),

  icon_coin: () =>
    svg(
      112,
      112,
      `<circle cx="56" cy="58" r="46" fill="${BRAND.goldDeep}"/>
      <circle cx="56" cy="52" r="46" fill="url(#c)"/>
      <circle cx="56" cy="52" r="33" fill="#ffffff30"/>
      ${prism(56, 52, 22, 45, 0.9)}`,
      radial('c', '#ffe3a0', BRAND.gold),
    ),

  icon_gem: () =>
    svg(
      112,
      112,
      `<polygon points="56,10 100,44 82,102 30,102 12,44" fill="url(#g)"/>
      <polygon points="56,10 100,44 56,60 12,44" fill="#ffffff44"/>
      <polygon points="56,60 82,102 30,102" fill="#00000030"/>`,
      linear('g', '#7fe3ff', '#2f7fd4', 160),
    ),

  icon_gear: () =>
    svg(
      160,
      120,
      `<g transform="translate(80,60)">
        ${[...Array(8)]
          .map(
            (_, i) =>
              `<rect x="-9" y="-52" width="18" height="24" rx="4" fill="${BRAND.text}" transform="rotate(${i * 45})"/>`,
          )
          .join('')}
        <circle r="34" fill="${BRAND.text}"/>
        <circle r="16" fill="${BRAND.deep}"/>
      </g>`,
    ),

  icon_back: () =>
    svg(
      156,
      152,
      `<path d="M96 30 L46 76 L96 122" fill="none" stroke="${BRAND.text}"
            stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),

  icon_mail: () =>
    svg(
      160,
      120,
      `<rect x="22" y="24" width="116" height="76" rx="10" fill="${BRAND.text}"/>
      <path d="M28 32 L80 70 L132 32" fill="none" stroke="${BRAND.deep}"
            stroke-width="10" stroke-linejoin="round"/>`,
    ),

  icon_emoji: () =>
    svg(
      176,
      168,
      `<circle cx="88" cy="84" r="66" fill="${BRAND.gold}"/>
      <circle cx="66" cy="68" r="10" fill="${BRAND.ink}"/>
      <circle cx="110" cy="68" r="10" fill="${BRAND.ink}"/>
      <path d="M56 100 Q88 128 120 100" fill="none" stroke="${BRAND.ink}"
            stroke-width="11" stroke-linecap="round"/>`,
    ),

  icon_trophy: () =>
    svg(
      100,
      100,
      `<path d="M28 16 H72 V44 Q72 66 50 66 Q28 66 28 44 Z" fill="url(#t)"/>
      <path d="M28 22 H16 Q16 44 30 48" fill="none" stroke="${BRAND.gold}" stroke-width="7"/>
      <path d="M72 22 H84 Q84 44 70 48" fill="none" stroke="${BRAND.gold}" stroke-width="7"/>
      <rect x="42" y="64" width="16" height="16" fill="${BRAND.goldDeep}"/>
      <rect x="28" y="78" width="44" height="12" rx="4" fill="${BRAND.gold}"/>`,
      linear('t', '#ffe3a0', BRAND.gold, 160),
    ),

  icon_crown: () =>
    svg(
      300,
      240,
      `<path d="M40 176 L26 66 L98 116 L150 44 L202 116 L274 66 L260 176 Z" fill="url(#c)"/>
      <rect x="40" y="176" width="220" height="26" rx="8" fill="${BRAND.goldDeep}"/>
      <circle cx="150" cy="132" r="14" fill="${BRAND.shard[0]}"/>
      <circle cx="92" cy="146" r="11" fill="${BRAND.shard[3]}"/>
      <circle cx="208" cy="146" r="11" fill="${BRAND.shard[2]}"/>`,
      linear('c', '#ffe3a0', BRAND.gold, 160),
    ),

  crown_winner: () =>
    svg(
      280,
      168,
      `<path d="M30 128 L18 40 L88 82 L140 20 L192 82 L262 40 L250 128 Z" fill="url(#c)"/>
      <rect x="30" y="128" width="220" height="22" rx="7" fill="${BRAND.goldDeep}"/>
      <circle cx="140" cy="92" r="13" fill="${BRAND.shard[0]}"/>`,
      linear('c', '#ffe3a0', BRAND.gold, 160),
    ),

  icon_cards_fan: () =>
    svg(
      440,
      268,
      `<g transform="translate(220,150)">
        ${[-28, -14, 0, 14, 28]
          .map(
            (a, i) =>
              `<g transform="rotate(${a}) translate(0,-18)">
                 <rect x="-52" y="-96" width="104" height="150" rx="14"
                       fill="${BRAND.shard[i % 4]}" stroke="${BRAND.paper}" stroke-width="6"/>
               </g>`,
          )
          .join('')}
      </g>`,
    ),

  icon_online: () =>
    svg(
      268,
      216,
      `<circle cx="94" cy="76" r="34" fill="${BRAND.shard[3]}"/>
      <path d="M40 168 Q40 118 94 118 Q148 118 148 168 Z" fill="${BRAND.shard[3]}"/>
      <circle cx="186" cy="92" r="28" fill="${BRAND.shard[2]}"/>
      <path d="M142 172 Q142 128 186 128 Q230 128 230 172 Z" fill="${BRAND.shard[2]}"/>`,
    ),

  icon_table: () =>
    svg(
      300,
      240,
      `<ellipse cx="150" cy="118" rx="122" ry="72" fill="${BRAND.shard[2]}"/>
      <ellipse cx="150" cy="110" rx="122" ry="72" fill="#3fbe74"/>
      <ellipse cx="150" cy="110" rx="94" ry="52" fill="none" stroke="#ffffff45" stroke-width="6"/>
      <rect x="128" y="88" width="44" height="58" rx="8" fill="${BRAND.paper}" transform="rotate(-12 150 117)"/>
      <rect x="140" y="84" width="44" height="58" rx="8" fill="${BRAND.gold}" transform="rotate(10 162 113)"/>`,
    ),

  /* ---- navigation ---- */

  nav_store: () =>
    svg(
      148,
      128,
      `<path d="M22 44 L38 18 H110 L126 44 Z" fill="${BRAND.gold}"/>
      <rect x="26" y="44" width="96" height="66" rx="8" fill="${BRAND.text}"/>
      <rect x="58" y="66" width="32" height="44" fill="${BRAND.deep}"/>`,
    ),

  nav_collection: () =>
    svg(
      136,
      128,
      `<rect x="24" y="22" width="52" height="76" rx="8" fill="${BRAND.shard[3]}" transform="rotate(-10 50 60)"/>
      <rect x="48" y="26" width="52" height="76" rx="8" fill="${BRAND.shard[0]}" transform="rotate(6 74 64)"/>
      <rect x="66" y="34" width="46" height="70" rx="8" fill="${BRAND.gold}" transform="rotate(18 89 69)"/>`,
    ),

  nav_events: () =>
    svg(
      140,
      152,
      `<rect x="24" y="34" width="92" height="86" rx="10" fill="${BRAND.text}"/>
      <rect x="24" y="34" width="92" height="24" rx="10" fill="${BRAND.shard[0]}"/>
      <rect x="40" y="20" width="10" height="26" rx="5" fill="${BRAND.dim}"/>
      <rect x="90" y="20" width="10" height="26" rx="5" fill="${BRAND.dim}"/>
      ${prism(70, 90, 20, 45)}`,
    ),

  nav_missions: () =>
    svg(
      128,
      128,
      `<rect x="26" y="18" width="76" height="94" rx="10" fill="${BRAND.text}"/>
      ${[0, 1, 2]
        .map(
          (i) =>
            `<rect x="38" y="${36 + i * 22}" width="10" height="10" rx="2" fill="${BRAND.shard[i]}"/>
             <rect x="54" y="${39 + i * 22}" width="34" height="5" rx="2" fill="${BRAND.dim}"/>`,
        )
        .join('')}`,
    ),

  nav_leaderboard: () =>
    svg(
      168,
      128,
      `<rect x="20" y="66" width="38" height="46" rx="5" fill="${BRAND.shard[3]}"/>
      <rect x="64" y="34" width="38" height="78" rx="5" fill="${BRAND.gold}"/>
      <rect x="108" y="82" width="38" height="30" rx="5" fill="${BRAND.shard[0]}"/>`,
    ),

  /* ---- avatars: original geometric portraits, one per shard colour ---- */

  avatar_player: () => avatar(164, 164, 0),
  avatar_sunny: () => avatar(176, 168, 1),
  avatar_moonlight: () => avatar(200, 200, 3),
  avatar_tigerx: () => avatar(172, 172, 2),

  avatar_winner: () =>
    svg(
      294,
      207,
      `<circle cx="147" cy="112" r="86" fill="url(#a)"/>
      <circle cx="147" cy="112" r="86" fill="none" stroke="${BRAND.gold}" stroke-width="8"/>
      ${prism(147, 112, 52, 45, 0.9)}
      <circle cx="147" cy="112" r="22" fill="${BRAND.ink}"/>`,
      radial('a', BRAND.mid, BRAND.ink),
    ),

  /* ---- medals and badges ---- */

  medal_1: () => medal(BRAND.gold, '#ffe3a0', '1'),
  medal_2: () => medal('#c8d3e2', '#f2f6fb', '2'),
  medal_3: () => medal('#cd7f45', '#efb98a', '3'),

  badge_new: () =>
    svg(
      132,
      128,
      `<polygon points="66,8 84,44 124,50 95,78 102,118 66,99 30,118 37,78 8,50 48,44"
                fill="${BRAND.shard[0]}"/>
      <text x="66" y="78" font-family="${FONT}" font-size="30" font-weight="bold"
            fill="${BRAND.paper}" text-anchor="middle">NEW</text>`,
    ),

  confetti: () =>
    svg(
      129,
      675,
      [...Array(46)]
        .map((_, i) => {
          const x = (i * 37) % 110;
          const y = (i * 71) % 650;
          const c = BRAND.shard[i % 4];
          return `<rect x="${x}" y="${y}" width="12" height="20" rx="3" fill="${c}" opacity="0.9"
                   transform="rotate(${(i * 47) % 360} ${x + 6} ${y + 10})"/>`;
        })
        .join(''),
    ),

  /* ---- mode tiles ---- */

  mode_classic: () => modeTile(408, 340, 0, 'classic'),
  mode_flip: () => modeTile(376, 340, 3, 'flip'),
  mode_mayhem: () => modeTile(328, 316, 1, 'mayhem'),
  mode_wildrush: () => modeTile(256, 316, 2, 'wild'),
  mode_freestyle: () => modeTile(368, 316, 3, 'free'),

  /* ---- textures ---- */

  tex_navy: () =>
    svg(
      840,
      264,
      `<rect width="840" height="264" fill="${BRAND.ink}"/>
      ${[...Array(14)].map((_, i) => shard(-40 + i * 66, -30, 44, 330, i % 2 ? '#ffffff07' : '#ffffff03')).join('')}`,
    ),

  tex_water: () =>
    svg(
      660,
      360,
      `<rect width="660" height="360" fill="url(#w)"/>
      ${[...Array(10)]
        .map(
          (_, i) =>
            `<path d="M0 ${20 + i * 38} Q165 ${4 + i * 38} 330 ${20 + i * 38} T660 ${20 + i * 38}"
                   fill="none" stroke="#ffffff10" stroke-width="3"/>`,
        )
        .join('')}`,
      radial('w', '#1c4f7a', '#08243f'),
    ),

  theme_thumb: () =>
    svg(
      360,
      300,
      `<rect width="360" height="300" rx="18" fill="url(#t)"/>
      ${prism(180, 150, 88, 45, 0.85)}`,
      radial('t', '#1c4f7a', '#08243f'),
    ),
};

function avatar(w: number, h: number, shardIndex: number): string {
  const c = BRAND.shard[shardIndex]!;
  const d = BRAND.shardDark[shardIndex]!;
  const r = Math.min(w, h) / 2 - 4;
  return svg(
    w,
    h,
    `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="${d}"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${r - 6}" fill="${c}"/>
    <circle cx="${w / 2}" cy="${h / 2 - r * 0.22}" r="${r * 0.3}" fill="${BRAND.paper}"/>
    <path d="M${w / 2 - r * 0.62} ${h / 2 + r * 0.72}
             Q${w / 2} ${h / 2 + r * 0.05} ${w / 2 + r * 0.62} ${h / 2 + r * 0.72} Z"
          fill="${BRAND.paper}"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="none" stroke="${BRAND.paper}" stroke-width="5"/>`,
  );
}

function medal(base: string, light: string, n: string): string {
  return svg(
    140,
    140,
    `<circle cx="70" cy="76" r="52" fill="${base}"/>
    <circle cx="70" cy="70" r="52" fill="url(#m)"/>
    <circle cx="70" cy="70" r="38" fill="#ffffff35"/>
    <text x="70" y="86" font-family="${FONT}" font-size="46" font-weight="bold"
          fill="${BRAND.ink}" text-anchor="middle">${n}</text>`,
    linear('m', light, base, 160),
  );
}

/** Mode tiles: the prism, re-cut a different way for each mode. */
function modeTile(w: number, h: number, shardIndex: number, kind: string): string {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.34;
  const c = BRAND.shard[shardIndex]!;

  const art: Record<string, string> = {
    classic: `${prism(cx, cy, r, 45)}<circle cx="${cx}" cy="${cy}" r="${r * 0.34}" fill="${BRAND.ink}"/>`,
    flip: `${prism(cx, cy - r * 0.28, r * 0.8, 45, 0.95)}
           <g transform="translate(${cx},${cy + r * 0.62}) scale(1,-1)">${prism(0, 0, r * 0.8, 45, 0.45)}</g>
           <rect x="${cx - r}" y="${cy + r * 0.24}" width="${r * 2}" height="5" fill="${BRAND.paper}"/>`,
    mayhem: `${[0, 1, 2, 3, 4]
      .map(
        (i) =>
          `<polygon points="${cx},${cy - r} ${cx + r * 0.5},${cy} ${cx},${cy + r} ${cx - r * 0.5},${cy}"
                    fill="${BRAND.shard[i % 4]}" opacity="0.9"
                    transform="rotate(${i * 36} ${cx} ${cy})"/>`,
      )
      .join('')}`,
    wild: `${[0, 1, 2, 3]
      .map(
        (i) =>
          `<circle cx="${cx + Math.cos((i * Math.PI) / 2) * r * 0.42}"
                   cy="${cy + Math.sin((i * Math.PI) / 2) * r * 0.42}"
                   r="${r * 0.5}" fill="${BRAND.shard[i]}" opacity="0.75"/>`,
      )
      .join('')}`,
    free: `${[0, 1, 2, 3]
      .map((i) => shard(cx - r + i * (r / 2), cy - r, r * 0.42, r * 2, BRAND.shard[i]!))
      .join('')}`,
  };

  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" rx="26" fill="url(#bg)"/>
    ${art[kind] ?? art.classic}
    <rect width="${w}" height="${h}" rx="26" fill="none" stroke="${c}" stroke-width="5" opacity="0.7"/>`,
    radial('bg', BRAND.mid, BRAND.ink),
  );
}

/* ------------------------------------------------------------------ */
/* App icons                                                           */
/* ------------------------------------------------------------------ */

function appIcon(size: number, maskable: boolean): string {
  // A maskable icon must keep its content inside the safe circle (80% of the
  // canvas), so the mark is drawn smaller and the ground extends to the edge.
  const pad = maskable ? size * 0.22 : size * 0.13;
  const r = (size - pad * 2) / 2;
  const c = size / 2;
  return svg(
    size,
    size,
    `<rect width="${size}" height="${size}" fill="${BRAND.ink}"/>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    ${prism(c, c, r, 45)}
    <circle cx="${c}" cy="${c}" r="${r * 0.34}" fill="${BRAND.ink}"/>
    <circle cx="${c}" cy="${c}" r="${r * 0.18}" fill="${BRAND.gold}"/>`,
    radial('bg', BRAND.mid, BRAND.ink),
  );
}

function splashImage(w: number, h: number, dark: boolean): string {
  const ground = dark ? BRAND.ink : BRAND.deep;
  const r = Math.min(w, h) * 0.16;
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${ground}"/>
    ${prism(w / 2, h / 2 - r * 0.2, r, 45)}
    <circle cx="${w / 2}" cy="${h / 2 - r * 0.2}" r="${r * 0.32}" fill="${ground}"/>
    <circle cx="${w / 2}" cy="${h / 2 - r * 0.2}" r="${r * 0.17}" fill="${BRAND.gold}"/>
    <text x="${w / 2}" y="${h / 2 + r * 1.5}" font-family="${FONT}"
          font-size="${Math.round(r * 0.34)}" font-weight="bold" fill="${BRAND.paper}"
          text-anchor="middle" letter-spacing="${r * 0.06}">COLOR CLASH</text>`,
  );
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

async function render(source: string, file: string): Promise<void> {
  await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toFile(file);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(PWA_ICONS, { recursive: true });
  mkdirSync(RESOURCES, { recursive: true });

  let n = 0;
  for (const [name, make] of Object.entries(A)) {
    await render(make(), join(OUT, `${name}.png`));
    n += 1;
  }

  await render(appIcon(192, false), join(PWA_ICONS, 'icon-192.png'));
  await render(appIcon(512, false), join(PWA_ICONS, 'icon-512.png'));
  await render(appIcon(512, true), join(PWA_ICONS, 'maskable-512.png'));
  await render(appIcon(180, false), join(PWA_ICONS, 'apple-touch-180.png'));

  await render(appIcon(1024, false), join(RESOURCES, 'icon.png'));
  await render(splashImage(2732, 2732, false), join(RESOURCES, 'splash.png'));
  await render(splashImage(2732, 2732, true), join(RESOURCES, 'splash-dark.png'));

  console.log(`Rendered ${n} game images, 4 app icons, 1 store icon, 2 splash screens.`);
  console.log('All artwork is generated from the vector sources in this file.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
