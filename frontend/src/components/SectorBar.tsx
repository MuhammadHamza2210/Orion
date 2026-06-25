import { useMemo } from 'react';
import type { Sector, Stock } from '../types/stock';
import { SECTOR_COLORS, SECTORS } from '../types/stock';

interface SectorBarProps {
  stocks: Stock[];
}

interface SectorStat {
  sector: Sector;
  avg: number;
  count: number;
}

/** Bottom strip: average % change per sector, as a labeled bar each. */
export default function SectorBar({ stocks }: SectorBarProps) {
  const stats = useMemo<SectorStat[]>(() => {
    return SECTORS.map((sector) => {
      const members = stocks.filter((s) => s.sector === sector);
      const avg =
        members.length > 0
          ? members.reduce((sum, s) => sum + s.change_pct, 0) / members.length
          : 0;
      return { sector, avg, count: members.length };
    });
  }, [stocks]);

  // Scale bar widths against the strongest absolute move for contrast.
  const maxAbs = Math.max(0.5, ...stats.map((s) => Math.abs(s.avg)));

  return (
    <div className="flex items-stretch gap-3 border-t border-white/10 px-5 py-3">
      <span className="flex items-center pr-1 text-[10px] uppercase tracking-[0.2em] text-white/35">
        Sectors
      </span>
      <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(({ sector, avg }) => {
          const positive = avg >= 0;
          const width = `${(Math.abs(avg) / maxAbs) * 100}%`;
          return (
            <div key={sector} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-white/70">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SECTOR_COLORS[sector] }}
                  />
                  {sector}
                </span>
                <span
                  className="font-medium tabular-nums"
                  style={{ color: positive ? '#1D9E75' : '#E24B4A' }}
                >
                  {positive ? '+' : ''}
                  {avg.toFixed(2)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width,
                    backgroundColor: positive ? '#1D9E75' : '#E24B4A',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
