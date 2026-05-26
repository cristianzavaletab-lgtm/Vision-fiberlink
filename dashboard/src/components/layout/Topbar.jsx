import React, { useState } from 'react';
import { Search, Bell, Settings, ChevronDown, Command } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { CURRENT_USER } from '../../data/mockData';

const Topbar = () => {
  const { activeSede, setActiveSede, notificationCount } = useAppStore();
  const [sedeOpen, setSedeOpen] = useState(false);

  const sedes = ['Lima HQ', 'Arequipa', 'Cusco', 'Trujillo', 'Piura', 'Chiclayo'];

  return (
    <header
      style={{
        height: '54px',
        flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '12px',
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* ── Search ── */}
      <div
        style={{
          flex: 1,
          maxWidth: '340px',
          position: 'relative',
        }}
      >
        <Search
          size={14}
          color="var(--text-muted)"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          placeholder="Buscar dispositivos, usuarios, eventos..."
          className="input-field"
          style={{
            paddingLeft: '34px',
            paddingRight: '48px',
            height: '34px',
            fontSize: '12px',
          }}
        />
        {/* ⌘K */}
        <div
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '5px',
            padding: '2px 5px',
          }}
        >
          <Command size={10} color="var(--text-muted)" />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>K</span>
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* ── Sede Selector ── */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setSedeOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 11px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 600,
            outline: 'none',
            transition: 'border-color 0.18s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <span
            style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 6px var(--accent)',
              flexShrink: 0,
            }}
          />
          Sede: {activeSede}
          <ChevronDown size={13} color="var(--text-secondary)" style={{ transform: sedeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>

        {sedeOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '6px',
              minWidth: '160px',
              zIndex: 100,
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            {sedes.map(s => (
              <button
                key={s}
                onClick={() => { setActiveSede(s); setSedeOpen(false); }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 10px',
                  background: s === activeSede ? 'var(--accent-subtle)' : 'transparent',
                  border: 'none',
                  borderRadius: '7px',
                  color: s === activeSede ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: s === activeSede ? 700 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (s !== activeSede) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (s !== activeSede) e.currentTarget.style.background = 'transparent'; }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Notifications ── */}
      <button
        style={{
          position: 'relative',
          width: '34px',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color 0.18s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <Bell size={15} color="var(--text-secondary)" />
        {notificationCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              background: 'var(--accent)',
              borderRadius: '50%',
              border: '1.5px solid var(--bg-sidebar)',
            }}
          />
        )}
      </button>

      {/* ── Settings ── */}
      <button
        style={{
          width: '34px',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          cursor: 'pointer',
          outline: 'none',
          transition: 'border-color 0.18s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <Settings size={15} color="var(--text-secondary)" />
      </button>

      {/* ── User avatar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          padding: '4px 10px 4px 4px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'border-color 0.18s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-hover)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        {/* Initials */}
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 800,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {CURRENT_USER.initials}
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {CURRENT_USER.name}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.2 }}>
            {CURRENT_USER.role}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
