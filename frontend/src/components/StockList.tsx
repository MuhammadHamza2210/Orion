import { useMemo, useState } from 'react';
import type { Sector, Stock } from '../types/stock';
import {
  SECTOR_COLORS,
  SECTORS,
  abbreviate,
  formatPct,
  formatPrice,
} from '../types/stock';
import Sparkline from './Sparkline';

interface StockListProps {
  stocks: Stock[];
  selected: string | null;
  onSelect: (ticker: string) => void;
}

type SortKey = 'cap' | 'change' | 'price' | 'alpha';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'cap', label: 'Cap' },
  { key: 'change', label: '% Chg' },
  { key: 'price', label: 'Price' },
  { key: 'alpha', label: 'A–Z' },
];

export default function StockList({
  stocks,
  selected,
  onSelect,
}: StockListProps) {
  const [sort, setSort] = useState<SortKey>('cap');
  const [activeSector, setActiveSector] = useState<Sector | 'All'>('All');

  const visible = useMemo<Stock[]>(() => {
    const filtered =
      activeSector === 'All'
        ? stocks
        : stocks.filter((s) => s.sector === activeSector);

    const sorted = [...filtered];
    switch (sort) {
      case 'cap':
        sorted.sort((a, b) => b.market_cap - a.market_cap);
        break;
      case 'change':
        sorted.sort((a, b) => b.change_pct - a.change_pct);
        break;
      case 'price':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'alpha':
        sorted.sort((a, b) => a.ticker.localeCompare(b.ticker));
        break;
    }
    return sorted;
  }, [stocks, sort, activeSector]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
      {/* Sector filter pills */}
      <div className="flex flex-wrap gap-1.5 border-b border-white/10 p-3">
        <FilterPill
          label="All"
          active={activeSector === 'All'}
          color="#9aa3b2"
          onClick={() => setActiveSector('All')}
        />
        {SECTORS.map((s) => (
          <FilterPill
            key={s}
            label={s}
            active={activeSector === s}
            color={SECTOR_COLORS[s]}
            onClick={() => setActiveSector(s)}
          />
        ))}
      </div>

      {/* Sort row */}
      <div className="flex items-center gap-1 px-3 py-2 text-[11px] text-white/40">
        <span className="mr-auto uppercase tracking-wider">
          {visible.length} stocks
        </span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            className={`rounded-md px-2 py-1 transition-colors ${
              sort === s.key
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((s) => {
          const positive = s.change_pct >= 0;
          const isSelected = s.ticker === selected;
          return (
            <button
              key={s.ticker}
              onClick={() => onSelect(s.ticker)}
              className={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? 'border-l-white bg-white/[0.07]'
                  : 'border-l-transparent hover:bg-white/[0.04]'
              }`}
            >
              <span
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: SECTOR_COLORS[s.sector] }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{s.ticker}</span>
                  <span className="truncate text-[11px] text-white/40">
                    {s.name}
                  </span>
                </div>
                <div className="text-[11px] text-white/40">
                  {abbreviate(s.market_cap)} cap
                </div>
              </div>

              <Sparkline data={s.spark} />

              <div className="w-20 shrink-0 text-right">
                <div className="font-medium tabular-nums text-white">
                  {formatPrice(s.price)}
                </div>
                <div
                  className="text-[11px] font-medium tabular-nums"
                  style={{ color: positive ? '#1D9E75' : '#E24B4A' }}
                >
                  {formatPct(s.change_pct)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FilterPillProps {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}

function FilterPill({ label, active, color, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all"
      style={{
        backgroundColor: active ? `${color}26` : 'transparent',
        borderColor: active ? `${color}80` : 'rgba(255,255,255,0.1)',
        color: active ? color : 'rgba(255,255,255,0.55)',
      }}
    >
      {label}
    </button>
  );
}
