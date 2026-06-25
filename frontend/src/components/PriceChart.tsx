import { useEffect, useRef } from 'react';
import {
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, ChartKind } from '../types/stock';
import { GAIN_COLOR, LOSS_COLOR } from '../types/stock';

interface PriceChartProps {
  candles: Candle[];
  kind: ChartKind;
  /** Accent color (sector color) for the area series line/fill. */
  accent: string;
}

/**
 * TradingView lightweight-charts wrapper. Renders either an area line or
 * candlesticks. The chart instance is created once; the series is rebuilt
 * whenever the data, kind, or accent changes.
 */
export default function PriceChart({ candles, kind, accent }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Create the chart once.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.45)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1c1f26' },
        horzLine: { color: 'rgba(255,255,255,0.2)', labelBackgroundColor: '#1c1f26' },
      },
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // (Re)build the series whenever data / kind / accent changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    let series: ISeriesApi<'Area'> | ISeriesApi<'Candlestick'>;

    if (kind === 'area') {
      const s = chart.addAreaSeries({
        lineColor: accent,
        topColor: `${accent}66`,
        bottomColor: `${accent}08`,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      s.setData(
        candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }))
      );
      series = s;
    } else {
      const s = chart.addCandlestickSeries({
        upColor: GAIN_COLOR,
        downColor: LOSS_COLOR,
        borderVisible: false,
        wickUpColor: GAIN_COLOR,
        wickDownColor: LOSS_COLOR,
      });
      s.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      series = s;
    }

    chart.timeScale().fitContent();

    return () => {
      // Only remove the series if this chart is still the live instance. During
      // StrictMode's dev double-invoke (and on unmount) the create-chart effect's
      // cleanup may have already called chart.remove(), which disposes every
      // series — calling removeSeries() on a disposed chart throws and would
      // crash the whole app to a blank screen.
      if (chartRef.current === chart) {
        chart.removeSeries(series);
      }
    };
  }, [candles, kind, accent]);

  return <div ref={containerRef} className="h-full w-full" />;
}
