/**
 * Prepares the Capacitor-generated Android project for a signed release build.
 *
 * `npx cap add android` regenerates `android/` from scratch on every CI run, so
 * there is no committed `build.gradle` to edit. This script patches the freshly
 * generated one instead:
 *
 *   - adds a release `signingConfig` that reads credentials from the
 *     environment (never from a file in the repository)
 *   - points the release build type at it
 *   - sets `versionCode` / `versionName`
 *   - pins `compileSdk` / `targetSdk`, so a Capacitor version bump cannot
 *     silently drop the app below Play's target-API requirement
 *
 * Every patch fails loudly if its anchor is missing. That matters more than it
 * looks: the dangerous failure mode is not a crash, it is silently producing an
 * *unsigned* bundle that Play then rejects, or worse, a signed bundle with the
 * wrong version code.
 *
 *   npx tsx tools/android-release.ts
 *
 * Environment:
 *   ANDROID_VERSION_CODE   integer, must increase with every Play upload
 *   ANDROID_VERSION_NAME   e.g. "1.0.3"
 *   ANDROID_COMPILE_SDK    optional, default below
 *   ANDROID_TARGET_SDK     optional, default below
 *   ANDROID_MIN_SDK        optional, default below
 *
 * The keystore itself is read at build time by Gradle from these, which the
 * workflow populates from encrypted repository secrets:
 *   CLASH_KEYSTORE_PATH  CLASH_KEYSTORE_PASSWORD  CLASH_KEY_ALIAS  CLASH_KEY_PASSWORD
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Play requires new apps and updates to target a recent API level, and the
 * requirement moves every year. Pinning it here (rather than inheriting
 * whatever Capacitor ships) makes the bump a one-line, reviewable change.
 * Check the current minimum in the Play Console before a release.
 */
export const DEFAULT_COMPILE_SDK = 35;
export const DEFAULT_TARGET_SDK = 35;
export const DEFAULT_MIN_SDK = 23;

export class PatchError extends Error {}

/* ------------------------------------------------------------------ */
/* build.gradle                                                        */
/* ------------------------------------------------------------------ */

export type SigningOptions = {
  versionCode: number;
  versionName: string;
};

const SIGNING_BLOCK = `
    // Injected by tools/android-release.ts.
    // Credentials come from the environment; nothing secret is ever committed.
    signingConfigs {
        release {
            def keystorePath = System.getenv("CLASH_KEYSTORE_PATH")
            if (keystorePath != null && !keystorePath.isEmpty()) {
                storeFile file(keystorePath)
                storePassword System.getenv("CLASH_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CLASH_KEY_ALIAS")
                keyPassword System.getenv("CLASH_KEY_PASSWORD")
            }
        }
    }
`;

export function patchBuildGradle(source: string, opts: SigningOptions): string {
  let out = source;

  if (!/android\s*\{/.test(out)) {
    throw new PatchError('build.gradle has no `android { }` block — layout changed?');
  }

  // 1. signingConfigs, inserted immediately before buildTypes.
  if (!out.includes('signingConfigs {')) {
    const buildTypes = out.indexOf('buildTypes {');
    if (buildTypes < 0) {
      throw new PatchError('build.gradle has no `buildTypes {` block to anchor signingConfigs to');
    }
    // Keep the indentation of the line buildTypes sits on.
    const lineStart = out.lastIndexOf('\n', buildTypes) + 1;
    out = out.slice(0, lineStart) + SIGNING_BLOCK.trimStart() + '\n' + out.slice(lineStart);
  }

  // 2. point the release build type at it
  if (!/release\s*\{[^}]*signingConfig\s+signingConfigs\.release/s.test(out)) {
    const before = out;
    out = out.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{)/,
      '$1\n            signingConfig signingConfigs.release',
    );
    if (out === before) {
      throw new PatchError(
        'could not find a `release { }` build type to attach the signing config to',
      );
    }
  }

  // 3. version code / name
  out = replaceOrThrow(out, /versionCode\s+\d+/, `versionCode ${opts.versionCode}`, 'versionCode');
  out = replaceOrThrow(
    out,
    /versionName\s+"[^"]*"/,
    `versionName "${opts.versionName}"`,
    'versionName',
  );

  return out;
}

function replaceOrThrow(
  source: string,
  pattern: RegExp,
  replacement: string,
  what: string,
): string {
  if (!pattern.test(source)) {
    throw new PatchError(`could not find ${what} in build.gradle`);
  }
  return source.replace(pattern, replacement);
}

/* ------------------------------------------------------------------ */
/* variables.gradle                                                    */
/* ------------------------------------------------------------------ */

export type SdkLevels = {
  compileSdk: number;
  targetSdk: number;
  minSdk: number;
};

export function patchVariables(source: string, sdk: SdkLevels): string {
  let out = source;
  const set = (key: string, value: number) => {
    const pattern = new RegExp(`${key}\\s*=\\s*\\d+`);
    if (!pattern.test(out)) {
      throw new PatchError(`variables.gradle has no ${key}`);
    }
    out = out.replace(pattern, `${key} = ${value}`);
  };
  set('minSdkVersion', sdk.minSdk);
  set('compileSdkVersion', sdk.compileSdk);
  set('targetSdkVersion', sdk.targetSdk);
  return out;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new PatchError(`${name} must be a positive integer, got "${raw}"`);
  }
  return value;
}

export function main(root = resolve(import.meta.dirname, '..')): void {
  const appGradle = join(root, 'android/app/build.gradle');
  const variables = join(root, 'android/variables.gradle');

  if (!existsSync(appGradle)) {
    throw new PatchError(
      `${appGradle} not found — run \`npx cap add android\` before this script.`,
    );
  }

  const versionCode = num('ANDROID_VERSION_CODE', 1);
  const versionName = process.env.ANDROID_VERSION_NAME ?? '1.0.0';

  writeFileSync(
    appGradle,
    patchBuildGradle(readFileSync(appGradle, 'utf8'), { versionCode, versionName }),
  );

  if (existsSync(variables)) {
    writeFileSync(
      variables,
      patchVariables(readFileSync(variables, 'utf8'), {
        compileSdk: num('ANDROID_COMPILE_SDK', DEFAULT_COMPILE_SDK),
        targetSdk: num('ANDROID_TARGET_SDK', DEFAULT_TARGET_SDK),
        minSdk: num('ANDROID_MIN_SDK', DEFAULT_MIN_SDK),
      }),
    );
  }

  const signed = Boolean(process.env.CLASH_KEYSTORE_PATH);
  console.log(
    `Patched android/ for release:\n` +
      `  versionCode ${versionCode}, versionName ${versionName}\n` +
      `  targetSdk ${num('ANDROID_TARGET_SDK', DEFAULT_TARGET_SDK)}\n` +
      `  signing: ${signed ? 'configured from environment' : 'NOT configured (unsigned build)'}`,
  );
}

// Run only when invoked directly, so the tests can import the functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(`android-release: ${(e as Error).message}`);
    process.exit(1);
  }
}

export { fileURLToPath };
