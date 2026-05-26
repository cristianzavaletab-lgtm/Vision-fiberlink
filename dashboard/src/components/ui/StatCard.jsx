import React from 'react';
import {
  Building2, Monitor, WifiOff, AlertTriangle, Users,
} from 'lucide-react';

const ICONS = {
  building: Building2,
  monitor: Monitor,
  'wifi-off': WifiOff,
  alert: AlertTriangle,
  users: Users,
};

const StatCard = ({ icon, label, value, trend, trendUp }) => {
  const IconComp = ICONS[icon] || Monitor;

  return (
    <div
      className="card"
      style={{
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'border-color 0.2s, transform 0.2s',
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(232,73,15,0.25)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Top row: icon + trend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Icon box */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconComp size={17} color="var(--accent)" strokeWidth={1.8} />
        </div>

        {/* Trend badge */}
        {trend && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: trendUp ? 'var(--status-online)' : 'var(--status-offline)',
              background: trendUp ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              padding: '2px 7px',
              borderRadius: '100px',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>

      {/* Value + label */}
      <div>
        <div
          style={{
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            marginBottom: '5px',
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {label}
        </div>
      </div>

      {/* Decorative glow bottom-right */}
      <div
        style={{
          position: 'absolute',
          bottom: '-12px',
          right: '-12px',
          width: '60px',
          height: '60px',
          background: 'var(--accent-glow)',
          borderRadius: '50%',
          filter: 'blur(20px)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default StatCard;
