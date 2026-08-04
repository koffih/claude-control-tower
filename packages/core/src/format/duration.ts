/**
 * Duration and magnitude formatting.
 *
 * The status line is read in peripheral vision, mid-thought. Every formatter here
 * optimises for being *scannable* rather than precise: `2h14` beats `2 hours and
 * 14 minutes`, and `1.2M` beats `1_234_567`. Widths stay small and stable so that
 * segments do not jitter between renders.
 */

/** Compact wall-clock duration: `48s`, `9m`, `2h14`, `3d`. */
export function formatDuration(millis: number): string {
  if (!Number.isFinite(millis) || millis < 0) return '—';

  const totalSeconds = Math.floor(millis / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${totalHours}h` : `${totalHours}h${String(minutes).padStart(2, '0')}`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days}d` : `${days}d${hours}h`;
}

/** Same as `formatDuration` but phrased as a countdown: `in 2h14`, `now`. */
export function formatCountdown(millis: number): string {
  if (!Number.isFinite(millis) || millis <= 0) return 'now';
  return `in ${formatDuration(millis)}`;
}

/** Thousands-compacted token counts: `840`, `12.4k`, `1.2M`. */
export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '—';
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) {
    const thousands = count / 1000;
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
  }
  const millions = count / 1_000_000;
  return `${millions < 10 ? millions.toFixed(1) : Math.round(millions)}M`;
}

/**
 * Session cost in USD.
 *
 * Sub-cent amounts round to `$0.00`, which reads as "free" and is the honest
 * signal at that magnitude — showing four decimals would imply a precision the
 * client-side estimate does not have.
 */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return '—';
  if (usd >= 100) return `$${Math.round(usd)}`;
  return `$${usd.toFixed(2)}`;
}

/** Whole-number percentage with no decimal noise: `87%`. */
export function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}
