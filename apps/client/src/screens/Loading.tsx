import { useEffect, useState } from 'react';
import { asset } from '../assets/index.js';

/**
 * The splash is allowed to hold the door for this long, and no longer.
 *
 * The floor stops the brand mark being a single-frame flash on a fast device.
 * The ceiling is the old fixed wait, kept only as a backstop for an image that
 * never settles — it is no longer what an ordinary launch pays.
 */
const MIN_SPLASH_MS = 400;
const MAX_SPLASH_MS = 1500;

/** Screen 1 — Loading. §9.1: "Splash: brand mark, fast load, offline asset prefetch". */
export function Loading({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    /*
     * The splash used to wait a flat 1,500 ms whether or not there was
     * anything left to wait for. Measured cold start to an interactive menu
     * was 2,050 ms against a page that finished loading at 135 ms, so almost
     * all of it was this timer. It now ends when the prefetch actually
     * finishes — the same work, just no longer padded.
     */
    const started = Date.now();
    // Real prefetch: every image is a data URI in the bundle, so decoding them
    // up front is what actually removes first-paint jank later.
    const names = [
      'card_back',
      'btn_clash',
      'avatar_player',
      'avatar_sunny',
      'avatar_moonlight',
      'avatar_tigerx',
      'tex_water',
      'tex_navy',
    ] as const;
    let loaded = 0;
    let cancelled = false;
    let done = false;
    let floor: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (cancelled || done) return;
      done = true;
      setPct(100);
      onDone();
    };

    /** Ends the splash, but never before the brand mark has been seen. */
    const finishWhenSeen = () => {
      if (cancelled || done) return;
      const waited = Date.now() - started;
      if (waited >= MIN_SPLASH_MS) finish();
      else floor = setTimeout(finish, MIN_SPLASH_MS - waited);
    };

    names.forEach((n) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded += 1;
        if (cancelled) return;
        setPct(Math.round((loaded / names.length) * 100));
        if (loaded === names.length) finishWhenSeen();
      };
      img.src = asset(n);
    });

    // Backstop: an image that never fires either handler must not strand the
    // player on the splash screen.
    const timer = setTimeout(finish, MAX_SPLASH_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (floor) clearTimeout(floor);
    };
  }, [onDone]);

  return (
    <div className="screen splash bg-splash">
      <div className="splash-cards" aria-hidden="true">
        <img
          className="splash-card"
          src={asset('splash_full')}
          alt=""
          style={{ display: 'none' }}
        />
      </div>
      <img className="splash-logo" src={asset('logo')} alt="Color Clash" />
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${Math.max(pct, 8)}%` }} />
      </div>
      <div className="progress-label">
        <span>LOADING…</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}
