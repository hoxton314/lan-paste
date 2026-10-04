import { useEffect, useState } from 'react';

/** Search input that reports its value after the user pauses typing */
export function SearchBar({ onSearch, delay = 250 }: { onSearch: (q: string) => void; delay?: number }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const t = setTimeout(() => onSearch(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, onSearch]);

  return (
    <div className="relative">
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setValue('')}
        placeholder="Search clips…"
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 pl-8 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
      />
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">⌕</span>
    </div>
  );
}
