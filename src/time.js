export const DAY_MS = 24 * 60 * 60 * 1000;

export function remainingMs(expiresAt) {
  return new Date(expiresAt).getTime() - Date.now();
}

export function isSniperWindow(expiresAt) {
  const ms = remainingMs(expiresAt);
  return ms <= DAY_MS;
}

export function formatRemaining(expiresAt) {
  const ms = remainingMs(expiresAt);
  if (ms <= 0) return 'EXPIRED';

  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);

  if (days > 0) return `${days}d ${hours}h`;
  if (totalHours > 0) return `${totalHours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(1, Math.floor(ms / 1000))}s`;
}
