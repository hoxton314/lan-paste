const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;

export type TextPart = { kind: 'text'; value: string } | { kind: 'link'; value: string; href: string };

/** Split text into plain and link parts. Only http(s) URLs; trailing punctuation stays outside the link. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // Drop trailing punctuation that is almost never part of the URL
    while (/[.,;:!?)\]}]$/.test(url)) {
      // Keep a closing paren if the URL contains a matching opening one (e.g. Wikipedia links)
      if (url.endsWith(')') && url.split('(').length > url.split(')').length - 1) break;
      url = url.slice(0, -1);
    }
    const start = m.index!;
    if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) });
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        parts.push({ kind: 'link', value: url, href: parsed.href });
      } else {
        parts.push({ kind: 'text', value: url });
      }
    } catch {
      parts.push({ kind: 'text', value: url });
    }
    last = start + url.length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}

const CODE_KEYWORDS = /^\s*(import|export|from|const|let|var|function|def|class|return|if|for|while|public|private|package|fn|func|SELECT|INSERT|UPDATE|#include|#!\/)\b/m;

/** Heuristic: does this look like source code (worth syntax highlighting)? */
export function looksLikeCode(text: string): boolean {
  if (text.length > 100_000) return false;
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 3) return false;
  let score = 0;
  for (const line of lines) {
    if (/[{};]\s*$/.test(line) || /^\s*[})\]]/.test(line)) score++;
    else if (/^( {2,}|\t)\S/.test(line)) score += 0.5;
    if (/=>|::|->|==|!=|&&|\|\|/.test(line)) score += 0.5;
  }
  if (CODE_KEYWORDS.test(text)) score += 2;
  // Prose with many URLs/sentences shouldn't qualify
  return score / lines.length >= 0.5;
}

export const COLLAPSED_LINES = 8;
export const COLLAPSED_CHARS = 600;

export function isLongText(text: string): boolean {
  return text.length > COLLAPSED_CHARS || text.split('\n').length > COLLAPSED_LINES;
}
