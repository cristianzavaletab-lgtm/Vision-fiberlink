import React from 'react';

// ── Status chip: ONLINE / OFFLINE / IDLE / ALERTA / EN VIVO / etc.
const Badge = ({ status, label, size = 'md', pulse = false }) => {
  const map = {
    online:   { cls: 'chip-green',  text: label || 'ONLINE'   },
    offline:  { cls: 'chip-red',    text: label || 'OFFLINE'  },
    idle:     { cls: 'chip-amber',  text: label || 'IDLE'     },
    alert:    { cls: 'chip-red',    text: label || 'ALERTA'   },
    live:     { cls: 'chip-green',  text: label || 'EN VIVO'  },
    info:     { cls: 'chip-gray',   text: label || 'INFO'     },
    warning:  { cls: 'chip-amber',  text: label || 'WARNING'  },
    critical: { cls: 'chip-red',    text: label || 'CRÍTICO'  },
    resolved: { cls: 'chip-green',  text: label || 'RESUELTO' },
    in_review:{ cls: 'chip-amber',  text: label || 'EN REVISIÓN' },
    open:     { cls: 'chip-red',    text: label || 'ABIERTO'  },
    operational:{ cls: 'chip-green',text: label || 'OPERATIVO'},
    degraded: { cls: 'chip-amber',  text: label || 'DEGRADADO'},
    accent:   { cls: 'chip-accent', text: label || status     },
  };

  const { cls, text } = map[status] || { cls: 'chip-gray', text: label || status };

  const dotColor = {
    'chip-green': 'var(--status-online)',
    'chip-red':   'var(--status-offline)',
    'chip-amber': 'var(--status-idle)',
    'chip-gray':  'var(--text-muted)',
    'chip-accent':'var(--accent)',
  }[cls];

  const fontSize = size === 'sm' ? '10px' : size === 'lg' ? '12px' : '11px';

  return (
    <span
      className={`chip ${cls}`}
      style={{ fontSize, textTransform: 'uppercase', letterSpacing: '0.05em' }}
    >
      <span
        className={pulse ? 'animate-pulse-dot' : ''}
        style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      {text}
    </span>
  );
};

export default Badge;
