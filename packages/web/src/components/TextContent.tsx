import { useEffect, useMemo, useState } from 'react';
import { isLongText, linkify, looksLikeCode } from '../lib/text.js';

type Hljs = typeof import('highlight.js/lib/common').default;
let hljsPromise: Promise<Hljs> | null = null;

/** highlight.js is lazy-loaded (separate chunk) the first time code is shown */
function loadHljs(): Promise<Hljs> {
  hljsPromise ??= Promise.all([
    import('highlight.js/lib/common'),
    import('highlight.js/styles/github-dark.min.css'),
  ]).then(([m]) => m.default);
  return hljsPromise;
}

export function TextContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = useMemo(() => isLongText(text), [text]);
  const isCode = useMemo(() => looksLikeCode(text), [text]);
  const [highlighted, setHighlighted] = useState<{ html: string; lang?: string } | null>(null);

  useEffect(() => {
    if (!isCode) return;
    let cancelled = false;
    loadHljs()
      .then((hljs) => {
        const res = hljs.highlightAuto(text);
        // Low relevance = probably not actually code; keep plain rendering
        if (!cancelled && res.relevance >= 5) setHighlighted({ html: res.value, lang: res.language });
      })
      .catch(() => {
        // offline / chunk failed — plain text is fine
      });
    return () => {
      cancelled = true;
    };
  }, [text, isCode]);

  const collapsedClass = long && !expanded ? 'max-h-40 overflow-hidden fade-bottom' : '';

  return (
    <div className="mb-3">
      {highlighted ? (
        <div className="relative">
          <pre className={`hljs rounded bg-zinc-950/60 p-2 text-xs leading-relaxed overflow-x-auto ${collapsedClass}`}>
            {/* hljs escapes its input, so its HTML output is safe to inject */}
            <code dangerouslySetInnerHTML={{ __html: highlighted.html }} />
          </pre>
          {highlighted.lang && (
            <span className="absolute top-1 right-2 text-[10px] uppercase text-zinc-500">{highlighted.lang}</span>
          )}
        </div>
      ) : (
        <pre className={`whitespace-pre-wrap break-words text-sm text-zinc-200 font-mono leading-relaxed ${collapsedClass}`}>
          {linkify(text).map((part, i) =>
            part.kind === 'link' ? (
              <a
                key={i}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 underline decoration-sky-400/40 hover:decoration-sky-400"
                onClick={(e) => e.stopPropagation()}
              >
                {part.value}
              </a>
            ) : (
              <span key={i}>{part.value}</span>
            ),
          )}
        </pre>
      )}
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? 'Show less' : `Show more (${text.split('\n').length} lines)`}
        </button>
      )}
    </div>
  );
}
