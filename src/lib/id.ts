export function createId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${now}-${random}`;
}
