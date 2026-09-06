import { describe, expect, it } from '@colorclash/test-fixtures';
import { BuildError, inlineDocument, safeScript, toFragment } from './build-single-file.js';

/**
 * The one-document build's assembly step.
 *
 * The build itself needs Vite installed, so it runs in CI. This is the part
 * that does not: the text transformation that turns Vite's two-file output into
 * a single document. It is worth pinning because every way it can go wrong
 * produces a file that looks fine on disk and is blank in a browser — a missed
 * tag leaves a request to a file that is not shipped, and an unescaped
 * `</script>` truncates the page at the first one.
 */

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Color Clash</title>
<script type="module" crossorigin src="/app.js"></script>
<link rel="stylesheet" crossorigin href="/app.css">
</head>
<body>
<div id="root"></div>
</body>
</html>`;

describe('single-file build — inlining', () => {
  it('puts the script and the stylesheet inside the document', () => {
    const out = inlineDocument(HTML, 'console.log(1)', '.a{color:red}');
    expect(out.includes('<script type="module">')).toBe(true);
    expect(out.includes('console.log(1)')).toBe(true);
    expect(out.includes('<style>')).toBe(true);
    expect(out.includes('.a{color:red}')).toBe(true);
  });

  it('leaves nothing behind to fetch', () => {
    const out = inlineDocument(HTML, 'x', 'y');
    expect(/src="[^"]*app\.js"/.test(out)).toBe(false);
    expect(/href="[^"]*app\.css"/.test(out)).toBe(false);
  });

  it('keeps the rest of the document exactly as it was', () => {
    const out = inlineDocument(HTML, 'x', 'y');
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out.includes('<div id="root"></div>')).toBe(true);
    expect(out.includes('<title>Color Clash</title>')).toBe(true);
  });

  it('survives a bundle containing a closing script tag', () => {
    // A string literal like "</script>" in the bundle would otherwise end the
    // tag early and truncate everything after it.
    const out = inlineDocument(HTML, 'const s = "</script>";', 'y');
    expect(out.includes('<\\/script>')).toBe(true);
    // The only real </script> closers are the ones this build wrote.
    expect(out.split('</script>').length - 1).toBe(1);
  });

  it('refuses a document with nothing to inline rather than shipping it', () => {
    // Silently emitting an unmodified page is how a build produces a file that
    // is blank in every browser and looks fine in the log.
    expect(() => inlineDocument('<html><body></body></html>', 'x', 'y')).toThrow();
    try {
      inlineDocument('<html><body></body></html>', 'x', 'y');
    } catch (e) {
      expect(e instanceof BuildError).toBe(true);
    }
  });
});

describe('single-file build — the fragment variant', () => {
  it('drops the skeleton and keeps both halves of the content', () => {
    const fragment = toFragment(inlineDocument(HTML, 'console.log(1)', '.a{color:red}'));
    expect(fragment.includes('<!doctype')).toBe(false);
    expect(fragment.includes('<body>')).toBe(false);
    expect(fragment.includes('<title>Color Clash</title>')).toBe(true);
    expect(fragment.includes('<div id="root"></div>')).toBe(true);
    expect(fragment.includes('console.log(1)')).toBe(true);
  });
});

describe('single-file build — escaping', () => {
  it('only touches the sequence that ends a script tag', () => {
    expect(safeScript('a </script> b')).toBe('a <\\/script> b');
    expect(safeScript('a </style> b')).toBe('a </style> b');
    expect(safeScript('plain')).toBe('plain');
  });
});
