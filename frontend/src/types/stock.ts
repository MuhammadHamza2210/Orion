export type Sector = 'Tech' | 'Finance' | 'Healthcare' | 'Energy' | 'Consumer';

export interface Stock {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  market_cap: number;
  sector: Sector;
  /** Recent closing prices for the list sparkline. */
  spark: number[];
}

/** One OHLC candle for the price chart. `time` is a UNIX timestamp (seconds). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartRange = '1D' | '1W' | '1M' | '1Y';
export type ChartKind = 'area' | 'candles';

/** Sector -> hex color, shared by Three.js and the UI legend/badges. */
export const SECTOR_COLORS: Record<Sector, string> = {
  Tech: '#7F77DD',
  Finance: '#1D9E75',
  Healthcare: '#D85A30',
  Energy: '#EF9F27',
  Consumer: '#378ADD',
};

export const SECTORS: Sector[] = [
  'Tech',
  'Finance',
  'Healthcare',
  'Energy',
  'Consumer',
];

export const GAIN_COLOR = '#1D9E75';
export const LOSS_COLOR = '#E24B4A';

/** Abbreviate large numbers: 1.2T, 3.4B, 5.6M, 7.8K. */
export function abbreviate(value: number): string {
  if (!isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

/** Price formatted to 2 decimals with a leading $. */
export function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Signed percentage to 2 decimals, e.g. "+1.24%" / "-0.80%". */
export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
