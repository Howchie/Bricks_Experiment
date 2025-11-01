/**
 * Formats HUD copy so the renderer can stay focused on drawing.
 */
export const buildHUDLines = ({ stats, remainingMs, blockLabel, drtStats }) => {
  const hasTimer = Number.isFinite(remainingMs);
  const timeSec = hasTimer ? Math.max(0, remainingMs) / 1000 : null;
  const timeLine = hasTimer ? `Time left: ${timeSec.toFixed(1)}s` : 'Time left: --';
  return [
    `Block: ${blockLabel ?? 'N/A'}`,
    timeLine,
    `Active: ${stats.bricksActive} | Cleared: ${stats.cleared} | Dropped: ${stats.dropped}`,
    `DRT Hits: ${drtStats?.hits ?? 0} | Misses: ${drtStats?.misses ?? 0}`
  ];
};
