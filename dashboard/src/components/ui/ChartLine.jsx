import React, { useMemo } from 'react';

const ChartLine = ({ data = [], width = 700, height = 200, label = 'Dispositivos conectados — 24h', sublabel = 'Telemetría en tiempo real por sede consolidada' }) => {
  const padding = { top: 20, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { min, max, points, pathD, areaD, yLabels, xLabels } = useMemo(() => {
    if (!data.length) return { min: 0, max: 0, points: [], pathD: '', areaD: '', yLabels: [], xLabels: [] };

    const min = Math.floor(Math.min(...data) * 0.95);
    const max = Math.ceil(Math.max(...data) * 1.02);
    const range = max - min || 1;

    const xStep = innerW / (data.length - 1);

    const points = data.map((v, i) => ({
      x: padding.left + i * xStep,
      y: padding.top + innerH - ((v - min) / range) * innerH,
    }));

    // Smooth bezier path
    const pathD = points.reduce((acc, pt, i) => {
      if (i === 0) return `M ${pt.x},${pt.y}`;
      const prev = points[i - 1];
      const cp1x = prev.x + (pt.x - prev.x) * 0.5;
      const cp2x = pt.x - (pt.x - prev.x) * 0.5;
      return `${acc} C ${cp1x},${prev.y} ${cp2x},${pt.y} ${pt.x},${pt.y}`;
    }, '');

    const areaD = `${pathD} L ${points[points.length - 1].x},${padding.top + innerH} L ${points[0].x},${padding.top + innerH} Z`;

    const yCount = 5;
    const yLabels = Array.from({ length: yCount }, (_, i) => {
      const val = min + (range / (yCount - 1)) * i;
      const y = padding.top + innerH - (i / (yCount - 1)) * innerH;
      return { val: Math.round(val), y };
    });

    const xLabels = ['00h', '04h', '08h', '12h', '16h', '20h', '24h'];
    const xLabelPositions = xLabels.map((lbl, i) => ({
      lbl,
      x: padding.left + (i / (xLabels.length - 1)) * innerW,
    }));

    return { min, max, points, pathD, areaD, yLabels, xLabels: xLabelPositions };
  }, [data, innerW, innerH, padding]);

  const gradId = 'chart-area-grad';

  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{sublabel}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--status-online)' }}>
          <span className="animate-pulse-dot" style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-online)' }} />
          En vivo
        </span>
      </div>

      {/* SVG Chart */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--chart-stroke)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--chart-stroke)" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Y-axis grid lines + labels */}
          {yLabels.map(({ val, y }) => (
            <g key={val}>
              <line
                x1={padding.left} y1={y}
                x2={padding.left + innerW} y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 6} y={y + 4}
                textAnchor="end"
                fontSize="9"
                fill="rgba(255,255,255,0.25)"
              >
                {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabels.map(({ lbl, x }) => (
            <text
              key={lbl}
              x={x} y={padding.top + innerH + 16}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(255,255,255,0.25)"
            >
              {lbl}
            </text>
          ))}

          {/* Area fill */}
          <path d={areaD} fill={`url(#${gradId})`} />

          {/* Line stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="var(--chart-stroke)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Last point dot */}
          {points.length > 0 && (
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="4"
              fill="var(--chart-stroke)"
            >
              <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
            </circle>
          )}
        </svg>
      </div>
    </div>
  );
};

export default ChartLine;
