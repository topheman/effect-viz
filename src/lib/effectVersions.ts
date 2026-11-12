/** A deployment of EffectViz, built on one major version of Effect. */
export interface EffectVersionSite {
  major: number;
  label: string;
  url: string;
}

/** Every deployed EffectViz, newest Effect first. */
export const EFFECT_VERSION_SITES: readonly EffectVersionSite[] = [
  { major: 4, label: "Effect 4", url: "https://effect-viz.vercel.app" },
  { major: 3, label: "Effect 3", url: "https://effect-viz-v3.vercel.app" },
];

/** The major version of a semver string such as `3.22.1` or `4.0.0-beta.3`. */
export function majorOf(version: string): number {
  return Number.parseInt(version, 10);
}
