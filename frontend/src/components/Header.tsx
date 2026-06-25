import { useEffect, useMemo, useState } from 'react';
import type { Stock } from '../types/stock';
import { SECTOR_COLORS } from '../types/stock';

interface HeaderProps {
  stocks: Stock[];
  isConnected: boolean;
  lastUpdated: Date | null;
  onSelect: (ticker: string) => void;
}

function useClock(): string {
  const [now, setNow] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const id = window.setInterval(
      () => setNow(new Date().toLocaleTimeString()),
      1000
    );
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function Header({
  stocks,
  isConnected,
  lastUpdated,
  onSelect,
}: HeaderProps) {
  const clock = useClock();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo<Stock[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stocks
      .filter(
        (s) =>
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q)
      )
      .slice(0, 7);
  }, [query, stocks]);

  const choose = (ticker: string): void => {
    onSelect(ticker);
    setQuery('');
    setOpen(false);
  };

  return (
    <header className="flex items-center gap-4 border-b border-white/10 px-5 py-3">
      {/* Logo */}
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-[0.3em] text-white">
          ORION
        </span>
        <span className="hidden text-[11px] uppercase tracking-[0.2em] text-white/40 sm:inline">
          Stock Universe
        </span>
      </div>

      {/* Search */}
      <div className="relative mx-auto w-full max-w-md">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length) choose(matches[0].ticker);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Search ticker or company…"
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-white/25"
        />
        {open && matches.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-white/10 bg-[#14161c] shadow-xl">
            {matches.map((s) => (
              <li key={s.ticker}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s.ticker);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-white/[0.06]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SECTOR_COLORS[s.sector] }}
                  />
                  <span className="w-14 font-semibold text-white">
                    {s.ticker}
                  </span>
                  <span className="truncate text-white/50">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Status + clock */}
      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-sm tabular-nums text-white/70 md:inline">
          {clock}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-white/60">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: isConnected ? '#1D9E75' : '#E24B4A',
              boxShadow: `0 0 8px ${isConnected ? '#1D9E75' : '#E24B4A'}`,
            }}
          />
          {isConnected ? 'Live' : 'Offline'}
        </span>
        {lastUpdated && (
          <span className="hidden text-[11px] text-white/30 lg:inline">
            {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  );
}
