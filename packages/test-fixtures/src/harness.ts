/**
 * A dependency-free test harness.
 *
 * The repository deliberately ships with zero runtime dependencies so the
 * engine can be verified in any environment (including an offline CI box) with
 * nothing but Node and TypeScript. The API is the familiar
 * describe/it/expect subset, so the suite can be pointed at Vitest or Jest
 * later without rewriting a single test.
 */

type Fn = () => void | Promise<void>;
type Case = { name: string; fn: Fn; only: boolean; skip: boolean };
type Suite = { name: string; cases: Case[] };

const suites: Suite[] = [];
let current: Suite | null = null;

export function describe(name: string, body: () => void): void {
  const suite: Suite = { name, cases: [] };
  suites.push(suite);
  const prev = current;
  current = suite;
  body();
  current = prev;
}

export function it(name: string, fn: Fn): void {
  if (!current) throw new Error('it() called outside describe()');
  current.cases.push({ name, fn, only: false, skip: false });
}

it.skip = (name: string, fn: Fn): void => {
  if (!current) throw new Error('it.skip() called outside describe()');
  current.cases.push({ name, fn, only: false, skip: true });
};

export const test = it;

export class AssertionError extends Error {}

export function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (!Object.is(actual, expected)) {
        throw new AssertionError(`expected ${fmt(expected)}, got ${fmt(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new AssertionError(`expected ${b}, got ${a}`);
    },
    toBeTruthy() {
      if (!actual) throw new AssertionError(`expected truthy, got ${fmt(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new AssertionError(`expected falsy, got ${fmt(actual)}`);
    },
    toBeUndefined() {
      if (actual !== undefined) throw new AssertionError(`expected undefined, got ${fmt(actual)}`);
    },
    toBeDefined() {
      if (actual === undefined) throw new AssertionError('expected defined, got undefined');
    },
    toBeGreaterThan(n: number) {
      if (!(Number(actual) > n)) throw new AssertionError(`expected ${fmt(actual)} > ${n}`);
    },
    toBeGreaterThanOrEqual(n: number) {
      if (!(Number(actual) >= n)) throw new AssertionError(`expected ${fmt(actual)} >= ${n}`);
    },
    toBeLessThan(n: number) {
      if (!(Number(actual) < n)) throw new AssertionError(`expected ${fmt(actual)} < ${n}`);
    },
    toBeLessThanOrEqual(n: number) {
      if (!(Number(actual) <= n)) throw new AssertionError(`expected ${fmt(actual)} <= ${n}`);
    },
    toContain(needle: unknown) {
      const ok = Array.isArray(actual)
        ? actual.includes(needle)
        : typeof actual === 'string' && actual.includes(String(needle));
      if (!ok) throw new AssertionError(`expected ${fmt(actual)} to contain ${fmt(needle)}`);
    },
    toHaveLength(n: number) {
      const len = (actual as { length?: number })?.length;
      if (len !== n) throw new AssertionError(`expected length ${n}, got ${len}`);
    },
    toThrow(codeOrMessage?: string) {
      let threw = false;
      let err: unknown;
      try {
        (actual as unknown as Fn)();
      } catch (e) {
        threw = true;
        err = e;
      }
      if (!threw) throw new AssertionError('expected function to throw');
      if (codeOrMessage) {
        const text = `${(err as Error)?.message ?? ''} ${(err as { code?: string })?.code ?? ''}`;
        if (!text.includes(codeOrMessage)) {
          throw new AssertionError(`expected throw matching "${codeOrMessage}", got "${text.trim()}"`);
        }
      }
    },
    not: {
      toBe(expected: T) {
        if (Object.is(actual, expected)) {
          throw new AssertionError(`expected not to be ${fmt(expected)}`);
        }
      },
      toContain(needle: unknown) {
        const ok = Array.isArray(actual) && actual.includes(needle);
        if (ok) throw new AssertionError(`expected ${fmt(actual)} not to contain ${fmt(needle)}`);
      },
      toThrow() {
        try {
          (actual as unknown as Fn)();
        } catch (e) {
          throw new AssertionError(`expected not to throw, got ${(e as Error).message}`);
        }
      },
    },
  };
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'object' && v !== null) {
    const s = JSON.stringify(v);
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  }
  return String(v);
}

export type RunReport = {
  passed: number;
  failed: number;
  skipped: number;
  failures: Array<{ suite: string; name: string; error: string }>;
};

export async function runAll(): Promise<RunReport> {
  const report: RunReport = { passed: 0, failed: 0, skipped: 0, failures: [] };
  const dim = '[2m';
  const red = '[31m';
  const green = '[32m';
  const yellow = '[33m';
  const reset = '[0m';

  for (const suite of suites) {
    console.log(`\n${dim}${suite.name}${reset}`);
    for (const c of suite.cases) {
      if (c.skip) {
        report.skipped++;
        console.log(`  ${yellow}○${reset} ${c.name}`);
        continue;
      }
      try {
        await c.fn();
        report.passed++;
        console.log(`  ${green}✓${reset} ${c.name}`);
      } catch (e) {
        report.failed++;
        const message = e instanceof Error ? e.message : String(e);
        report.failures.push({ suite: suite.name, name: c.name, error: message });
        console.log(`  ${red}✗${reset} ${c.name}`);
        console.log(`    ${red}${message}${reset}`);
        if (!(e instanceof AssertionError) && e instanceof Error && e.stack) {
          console.log(`${dim}${e.stack.split('\n').slice(1, 4).join('\n')}${reset}`);
        }
      }
    }
  }
  return report;
}

export function resetSuites(): void {
  suites.length = 0;
  current = null;
}
