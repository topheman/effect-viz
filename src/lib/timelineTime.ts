/**
 * Time helpers shared by the visualiser's live views.
 *
 * Trace event timestamps are expressed in *virtual* time, so anything measured
 * against them has to be virtual too. See `workshop/phase-10.md`.
 */

/** Wall/virtual pair captured when the first event of a run arrives. */
export interface VirtualAnchor {
  virtual: number;
  wall: number;
}

/**
 * Virtual "now", for views that need a cursor between events.
 *
 * Reading wall time here instead makes an in-progress elapsed grow `1 / rate`
 * times too fast, then snap back to the true span the moment the run ends and
 * the last event becomes the end.
 */
export function computeVirtualNow(
  anchor: VirtualAnchor | null,
  rate: number,
  wallNow: number,
): number {
  if (anchor === null) return Date.now();
  return anchor.virtual + (wallNow - anchor.wall) * rate;
}

const TARGET_TICK_COUNT = 8;

/**
 * Spacing for the timeline's time axis.
 *
 * Rounds up to the nearest 1, 2 or 5 times a power of ten, so the spacing is a
 * readable round number at any magnitude and the label count stays bounded. A
 * fixed cap instead crams one label per unit onto a long timeline until they
 * overlap into a smear.
 *
 * `targetCount` is how many ticks the axis has room for. The default suits a
 * desktop-width axis; a narrow one passes a smaller number, since eight labels
 * that read fine across 700px run into each other across 250px.
 */
export function computeTickInterval(
  duration: number,
  targetCount: number = TARGET_TICK_COUNT,
): number {
  const target = Math.max(duration, 1) / Math.max(targetCount, 1);
  const magnitude = 10 ** Math.floor(Math.log10(target));
  for (const multiple of [1, 2, 5]) {
    const step = multiple * magnitude;
    if (step >= target) return step;
  }
  return 10 * magnitude;
}
