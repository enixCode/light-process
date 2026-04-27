export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function fmtTime(ts: number | string | null | undefined): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleTimeString();
}
