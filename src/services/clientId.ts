/**
 * A persistent anonymous client identity, stored in localStorage. Used to track
 * "did I like / save this?" per browser while aggregate counts live server-side.
 * There is no auth in this app, so the ID is the only per-user signal.
 */
const KEY = 'grinxo-client-id';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
  } catch {
    /* localStorage unavailable (private mode) — fall through */
  }
  const id = makeId();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore storage errors */
  }
  return id;
}