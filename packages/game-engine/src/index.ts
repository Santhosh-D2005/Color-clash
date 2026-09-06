import { registerVersion } from './registry.js';
import { classicManifest } from './versions/classic.js';
import { flipManifest } from './versions/flip.js';
import { mayhemManifest } from './versions/mayhem.js';
import { allWildManifest } from './versions/allWild.js';
import { flexManifest } from './versions/flex.js';

// The five source-defined rulesets register exactly once, at import time.
registerVersion(classicManifest);
registerVersion(flipManifest);
registerVersion(mayhemManifest);
registerVersion(allWildManifest);
registerVersion(flexManifest);

export * from './registry.js';
export * from './reduce.js';
export * from './setup.js';
export * from './state.js';
export * from './legal.js';
export * from './turn.js';
export * from './draw.js';
export * from './clash.js';
export * from './invariants.js';
export * from './deck.js';
export * from './view.js';
export { applyResolutions, legalColors, eligibleTargets } from './resolve.js';
export { classicManifest, flipManifest, mayhemManifest, allWildManifest, flexManifest };
export { offersFlexChoice } from './versions/flex.js';
export {
  ALL_WILD_COLOR_MODE,
  allWildEffects,
  autoColorFor,
  type AllWildColorMode,
} from './versions/allWild.js';
