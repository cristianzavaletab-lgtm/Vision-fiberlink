import React from 'react';
import {
  LayoutDashboard, Building2, Monitor, Eye, Activity,
  AlertTriangle, FileText, Settings, Shield, Circle,
} from 'lucide-react';
import useAppStore from '../../store/useAppStore';

const NAV = [
  { key: 'dashboard',   label: 'Dashboard',         icon: LayoutDashboard },
  { key: 'sedes',       label: 'Sedes',              icon: Building2       },
  { key: 'dispositivos',label: 'Dispositivos',       icon: Monitor         },
  { key: 'monitoreo',   label: 'Monitoreo en vivo',  icon: Eye             },
  { key: 'actividad',   label: 'Actividad',          icon: Activity        },
  { key: 'incidencias', label: 'Incidencias',        icon: AlertTriangle   },
  { key: 'reportes',    label: 'Reportes',           icon: FileText        },
  { key: 'configuracion', label: 'Configuración',    icon: Settings        },
];

const Sidebar = () => {
  const { activeSection, setActiveSection, systemStatus, totalEndpoints, uptimePercent } = useAppStore();

  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '0',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      {/* ── Logo ── */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 0 12px var(--accent-glow)',
          }}
        >
          <Shield size={17} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            SentinelDesk
          </div>
          <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '1px' }}>
            Control Center
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV.map(({ key, label, icon: Icon }) => {
          const isActive = activeSection === key;
          return (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                textAlign: 'left',
                outline: 'none',
              }}
            >
              <Icon
                size={16}
                strokeWidth={isActive ? 2.2 : 1.8}
                color={isActive ? 'var(--accent)' : 'currentColor'}
              />
              <span style={{ fontSize: '13px' }}>{label}</span>

              {/* Incidencias badge */}
              {key === 'incidencias' && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'var(--status-offline)',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '100px',
                    minWidth: '18px',
                    textAlign: 'center',
                  }}
                >
                  6
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer status ── */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span
            className="animate-pulse-dot"
            style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: systemStatus === 'operational' ? 'var(--status-online)' : 'var(--status-idle)',
              boxShadow: `0 0 6px ${systemStatus === 'operational' ? 'var(--status-online)' : 'var(--status-idle)'}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Sistema operativo
          </span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '14px' }}>
          {totalEndpoints} endpoints · {uptimePercent}% uptime
        </span>
      </div>
    </aside>
  );
};

export default Sidebar;
