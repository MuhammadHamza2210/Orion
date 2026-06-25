import { useEffect, useRef, useState } from 'react';
import type { Candle, ChartKind, ChartRange, Stock } from '../types/stock';
import { API_BASE } from '../config';
import {
  SECTOR_COLORS,
  abbreviate,
  formatPct,
  formatPrice,
} from '../types/stock';
import PriceChart from './PriceChart';
import ErrorBoundary from './ErrorBoundary';

interface StockDetailProps {
  stock: Stock | null;
}

const RANGES: ChartRange[] = ['1D', '1W', '1M', '1Y'];

export default function StockDetail({ stock }: StockDetailProps) {
  const [range, setRange] = useState<ChartRange>('1M');
  const [kind, setKind] = useState<ChartKind>('area');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);

  const [analysis, setAnalysis] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ticker = stock?.ticker ?? null;
  const accent = stock ? SECTOR_COLORS[stock.sector] : '#7F77DD';
  const positive = stock ? stock.change_pct >= 0 : true;

  // Fetch OHLC history whenever the ticker or range changes.
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE}/history/${ticker}?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { candles: Candle[] }) => {
        if (!cancelled) setCandles(data.candles ?? []);
      })
      .catch(() => {
        if (!cancelled) setCandles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, range]);

  // Reset the AI analysis when switching stocks.
  useEffect(() => {
    setAnalysis('');
    setStreaming(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [ticker]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runAnalysis = async (): Promise<void> => {
    if (!stock) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalysis('');
    setStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: stock.ticker,
          price: stock.price,
          change: stock.change_pct,
          sector: stock.sector,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setAnalysis(`[Request failed: ${res.status}]`);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnalysis((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAnalysis((prev) => prev + `\n[Stream error: ${(err as Error).message}]`);
      }
    } finally {
      setStreaming(false);
    }
  };

  if (!stock) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/40">
        Select a stock to view its chart
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.03]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 p-5">
        <div className="flex items-end gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold tracking-tight text-white">
                {stock.ticker}
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: `${accent}26`,
                  color: accent,
                  border: `1px solid ${accent}66`,
                }}
              >
                {stock.sector}
              </span>
            </div>
            <div className="mt-1 text-sm text-white/45">{stock.name}</div>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <span className="text-3xl font-semibold tabular-nums text-white">
            {formatPrice(stock.price)}
          </span>
          <span
            className="pb-1 text-lg font-medium tabular-nums"
            style={{ color: positive ? '#1D9E75' : '#E24B4A' }}
          >
            {formatPct(stock.change_pct)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.05] p-1">
          {(['area', 'candles'] as ChartKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                kind === k ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/75'
              }`}
            >
              {k === 'area' ? 'Line' : 'Candles'}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-white/[0.05] p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/75'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative min-h-0 flex-1 px-3">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-white/40">
            Loading chart…
          </div>
        )}
        {candles.length > 0 && (
          <ErrorBoundary>
            <PriceChart candles={candles} kind={kind} accent={accent} />
          </ErrorBoundary>
        )}
      </div>

      {/* Stats + AI */}
      <div className="grid grid-cols-1 gap-4 border-t border-white/10 p-5 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Volume" value={abbreviate(stock.volume)} />
          <Stat label="Market Cap" value={abbreviate(stock.market_cap)} />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={runAnalysis}
            disabled={streaming}
            className="self-start rounded-lg border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {streaming ? 'Analyzing…' : 'AI Analysis'}
          </button>
          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-[13px] leading-relaxed text-white/80">
            {analysis ||
              (streaming ? '' : 'Get a quick AI take on this stock.')}
            {streaming && <span className="animate-pulse">▌</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}
