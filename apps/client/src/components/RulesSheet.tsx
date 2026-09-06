import type { GameVersion } from '@colorclash/shared';
import { CORE_RULES, rulesFor, VERSION_META } from '@colorclash/game-content';
import { Sheet } from './Sheet.js';

/**
 * The rules screen.
 *
 * A player could previously start Mayhem with no way to find out that a 7
 * swaps hands or that 25 cards eliminates you. The copy lives in
 * `game-content/rules.ts` beside the deck tables it describes, so a rule and
 * its explanation are changed in one place or not at all.
 *
 * Deliberately short lines rather than paragraphs: this is opened mid-match on
 * a phone, by someone who wants one specific answer.
 */
export function RulesSheet({
  version,
  onClose,
}: {
  version: GameVersion;
  onClose: () => void;
}) {
  const meta = VERSION_META[version];
  const sheet = rulesFor(version);

  return (
    <Sheet title={`${meta.title} — HOW TO PLAY`} onClose={onClose} wide>
      <p className="rules-objective">
        <b>Goal.</b> {sheet.objective}
      </p>

      {sheet.sections.map((section) => (
        <section className="rules-section" key={section.heading}>
          <h3 className="rules-heading">{section.heading}</h3>
          <ul className="rules-list">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}

      <div className="rules-divider" role="separator" />
      <p className="dim rules-note">These apply in every mode:</p>

      {CORE_RULES.map((section) => (
        <section className="rules-section" key={section.heading}>
          <h3 className="rules-heading">{section.heading}</h3>
          <ul className="rules-list">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
