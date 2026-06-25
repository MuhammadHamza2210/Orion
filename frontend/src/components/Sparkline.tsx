import { GAIN_COLOR, LOSS_COLOR } from '../types/stock';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

/** Tiny inline trend line for the stock list. Colored green/red by direction. */
export default function Sparkline({
  data,
  width = 72,
  height = 26,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - pad * 2) + pad;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const up = data[data.length - 1] >= data[0];
  const color = up ? GAIN_COLOR : LOSS_COLOR;
  const gradientId = `spark-${up ? 'up' : 'down'}`;

  // Area path under the line for a subtle fill.
  const areaPath = `M ${pad},${height} L ${points
    .split(' ')
    .join(' L ')} L ${width - pad},${height} Z`;

  return (
    <svg width={width} height={height} aria-hidden className="block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
