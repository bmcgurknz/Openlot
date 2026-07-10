/**
 * Isomorphic UUID — works in Node (>=19) and every modern browser, so the
 * domain services can run server-side (server edition) or fully in the
 * browser (static edition).
 */
export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}
