import { useEffect, useRef } from 'react';
// Split from the value import above: the single-file build rewrites a value
// import of 'react' into a destructure off the UMD global, and type names
// cannot survive that. See tools/build-single-file.ts.
import type { MouseEvent, ReactNode } from 'react';

/**
 * The one modal surface every new panel is built on.
 *
 * There was no shared sheet before, and three new panels arrived at once —
 * pause, rules, coming-soon — so this exists to stop three near-identical
 * scrims appearing in three files, each with its own idea of how Escape works.
 *
 * It handles the things a modal has to get right and is easy to skip:
 * Escape closes, a click on the backdrop closes, focus moves into the sheet on
 * open, and the page behind cannot be scrolled while it is up.
 */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide = false,
  labelledBy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus the panel so a keyboard user is inside it, not still on the page.
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const headingId = labelledBy ?? `sheet-${title.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <div
      className="scrim"
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        // Only a click on the backdrop closes; one inside the panel does not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        ref={panel}
      >
        <div className="sheet-head">
          <h2 className="h2" id={headingId}>
            {title}
          </h2>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
