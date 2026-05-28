import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';

interface LoginViewProps {
  onLogin: (accessToken: string, refreshToken: string, user: any) => void;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Por favor, ingresa tus credenciales.');
      return;
    }

    setIsLoading(true);

    try {
      const { api } = await import('../services/api');
      const res = await api.post('/auth/login', { email: username, password });
      onLogin(res.data.accessToken, res.data.refreshToken, res.data.user);
    } catch (err) {
      // Fallback dev mode
      console.warn("Real auth failed or not configured, using legacy fallback", err);
      if (username === 'admin' && password === '123') {
        onLogin('mock-access', 'mock-refresh', { id: 'legacy', name: 'Administrador (Legacy)', email: 'admin@local', role: 'SuperAdmin' });
      } else {
        setError('Usuario o contraseña incorrectos.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black flex items-center justify-center relative overflow-hidden">
      {/* ─── Subtle Ambient Effects ─── */}
      <div className="absolute top-[-30%] left-[-15%] w-[60%] h-[60%] rounded-full bg-brand/[0.04] blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-15%] w-[50%] h-[50%] rounded-full bg-brand/[0.03] blur-[150px] pointer-events-none" />
      
      {/* ─── Grid Pattern ─── */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      <div className="w-full max-w-[400px] px-6 relative z-10 animate-slide-up">
        
        {/* ─── Logo & Branding ─── */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="relative mb-6">
            <div className="w-12 h-12 rounded-xl bg-surface-elevated border border-surface-border flex items-center justify-center shadow-[0_0_30px_rgba(255,107,53,0.08)]">
              <span className="text-xl font-black text-brand">V</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-1.5 tracking-tight">
            VisionControl
          </h1>
          <p className="text-text-tertiary text-[13px]">Panel de Administración Central</p>
        </div>

        {/* ─── Login Card ─── */}
        <div className="relative bg-surface-elevated/50 border border-surface-border p-8 rounded-2xl">
          {/* Top accent line */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-brand/30 to-transparent" />
          
          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            {/* Username */}
            <div>
              <label className="block text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-2 ml-0.5">
                Usuario
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-text-primary transition-colors duration-200">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-surface-base border border-surface-border text-text-primary rounded-lg pl-11 pr-4 py-3 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/40 transition-all duration-200 placeholder:text-text-tertiary/40 text-[13px]"
                  placeholder="admin@visioncontrol.io"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold tracking-wider uppercase text-text-tertiary mb-2 ml-0.5">
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-text-primary transition-colors duration-200">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-base border border-surface-border text-text-primary rounded-lg pl-11 pr-11 py-3 focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/40 transition-all duration-200 placeholder:text-text-tertiary/40 text-[13px]"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-status-error/5 border border-status-error/15 rounded-lg flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-status-error shrink-0" />
                <p className="text-[12px] text-status-error font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-brand text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 hover:bg-brand-light active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-lg shadow-brand/20 hover:shadow-brand/40 group"
            >
              <div className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-[13px]">Iniciar Sesión</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        {/* ─── Footer ─── */}
        <p className="text-center text-[10px] text-text-tertiary/40 mt-8 font-medium tracking-wider">
          VISIONCONTROL v2.0 — POWERED BY FIBERLINK
        </p>
      </div>
    </div>
  );
}

