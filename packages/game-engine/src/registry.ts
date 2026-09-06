import { RuleError, type GameVersion, type VersionManifest } from '@colorclash/shared';

/**
 * §4.2: "Every ruleset registers through a VersionManifest interface."
 * The registry is the only place versions are enumerated, so adding a sixth
 * ruleset touches exactly one file plus its own module.
 */
const registry = new Map<GameVersion, VersionManifest>();

export function registerVersion(manifest: VersionManifest): void {
  if (registry.has(manifest.id)) {
    // Guards §18.1 rule 3: "Never create duplicate competing implementations".
    throw new Error(`Duplicate VersionManifest registration for ${manifest.id}`);
  }
  registry.set(manifest.id, manifest);
}

export function getManifest(version: GameVersion): VersionManifest {
  const m = registry.get(version);
  if (!m) throw new RuleError('UNKNOWN_VERSION', `No manifest registered for ${version}`);
  return m;
}

export function allManifests(): VersionManifest[] {
  return [...registry.values()];
}

export function isRegistered(version: GameVersion): boolean {
  return registry.has(version);
}
