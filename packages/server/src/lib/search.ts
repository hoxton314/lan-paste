/**
 * Turn free-form user input into a safe FTS5 MATCH expression:
 * every whitespace-separated term becomes a quoted prefix query, ANDed together.
 * Returns null when there is nothing searchable.
 */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter(Boolean)
    .slice(0, 16);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' ');
}
