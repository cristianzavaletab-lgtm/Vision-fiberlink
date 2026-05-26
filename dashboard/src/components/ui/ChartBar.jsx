import React from 'react';

const ChartBar = ({ data = [], label = 'Actividad por sede', sublabel = 'Eventos registrados hoy' }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{sublabel}</div>
      </div>

      {/* Bars */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '6px', paddingTop: '8px' }}>
        {data.map((d, i) => {
          const heightPct = (d.value / maxVal) * 100;
          const isHighest = d.value === maxVal;

          return (
            <div
              key={d.label}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}
            >
              {/* Value on top of bar */}
              <span style={{ fontSize: '10px', fontWeight: 700, color: isHighest ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {d.value}
              </span>

              {/* Bar */}
              <div
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  minHeight: '4px',
                  background: isHighest
                    ? 'var(--accent)'
                    : `rgba(232,73,15,${0.35 + (heightPct / 100) * 0.45})`,
                  borderRadius: '4px 4px 2px 2px',
                  transition: 'height 0.6s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Shimmer */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0, left: '-100%',
                    width: '60%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                    animation: `shimmer ${1.5 + i * 0.2}s ease-in-out infinite`,
                  }}
                />
              </div>

              {/* X label */}
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {d.label}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { left: -100%; }
          100% { left: 200%; }
        }
      `}</style>
    </div>
  );
};

export default ChartBar;
