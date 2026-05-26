import React from 'react';

const ProgressBar = ({ value = 0, max = 100, color, height = 4, showLabel = false, label = '' }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const getColor = () => {
    if (color) return color;
    if (pct >= 85) return 'var(--status-offline)';
    if (pct >= 65) return 'var(--status-idle)';
    return 'var(--accent)';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
      {label && (
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0, width: '28px' }}>
          {label}
        </span>
      )}
      <div
        style={{
          flex: 1,
          height: `${height}px`,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: '100px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: getColor(),
            borderRadius: '100px',
            transition: 'width 0.6s ease',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0, width: '28px', textAlign: 'right' }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
};

export default ProgressBar;
