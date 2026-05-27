import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight, Fingerprint } from 'lucide-react';

interface LoginViewProps {
  onLogin: (name: string) => void;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username || !password) {
      setError('Por favor, ingresa tus credenciales.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      if (username === 'admin' && password === '123') {
        onLogin('Administrador Principal');
      } else {
        setError('Usuario o contraseña incorrectos.');
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen w-full bg-[#060810] flex items-center justify-center relative overflow-hidden">
      {/* ─── Ambient Light Effects ─── */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand-primary/8 blur-[150px] pointer-events-none animate-breathe" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand-secondary/6 blur-[150px] pointer-events-none animate-breathe" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-[40%] left-[60%] w-[25%] h-[25%] rounded-full bg-purple-500/4 blur-[120px] pointer-events-none" />
      
      {/* ─── Grid Pattern ─── */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none" />
      
      {/* ─── Noise Texture ─── */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.015] pointer-events-none mix-blend-overlay" />

      <div className="w-full max-w-[420px] px-6 relative z-10 animate-float-up">
        
        {/* ─── Logo & Branding ─── */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="relative mb-6 group cursor-pointer">
            {/* Outer glow ring */}
            <div className="absolute inset-[-4px] rounded-2xl bg-gradient-to-br from-brand-primary/30 to-brand-secondary/30 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary p-[1.5px] shadow-2xl shadow-brand-primary/20 relative transition-transform hover:scale-105 duration-300">
              <div className="w-full h-full bg-[#0a0d14] rounded-[14px] flex items-center justify-center p-4">
                <Fingerprint className="w-9 h-9 text-brand-primary group-hover:scale-110 transition-transform duration-300" />
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">
            Vision<span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">Control</span>
          </h1>
          <p className="text-text-tertiary text-sm font-medium">Panel de Administración Central</p>
        </div>

        {/* ─── Login Card ─── */}
        <div className="relative overflow-hidden bg-bg-surface/5 backdrop-blur-2xl border border-glass-border p-8 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {/* Top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-primary/40 to-transparent" />
          {/* Subtle corner glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 blur-[60px] rounded-full pointer-events-none" />
          
          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            {/* Username */}
            <div>
              <label className="block text-[11px] font-bold tracking-[0.2em] uppercase text-text-tertiary mb-2.5 ml-1">
                Usuario
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-brand-primary transition-colors duration-300">
                  <User className="w-[18px] h-[18px]" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] text-text-primary rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:border-brand-primary/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(255,107,53,0.08)] transition-all duration-300 placeholder:text-text-tertiary/50 text-sm"
                  placeholder="admin"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-bold tracking-[0.2em] uppercase text-text-tertiary mb-2.5 ml-1">
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-brand-primary transition-colors duration-300">
                  <Lock className="w-[18px] h-[18px]" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.06] text-text-primary rounded-xl pl-12 pr-12 py-3.5 focus:outline-none focus:border-brand-primary/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(255,107,53,0.08)] transition-all duration-300 placeholder:text-text-tertiary/50 text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3.5 bg-red-500/5 border border-red-500/15 rounded-xl flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400 font-medium">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full relative group overflow-hidden bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold py-4 px-4 rounded-xl transition-all duration-300 hover:shadow-[0_8px_30px_rgba(255,107,53,0.3)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
            >
              {/* Shine overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.15)_45%,transparent_50%)] opacity-0 group-hover:opacity-100 group-hover:translate-x-[200%] transition-all duration-700" />
              <div className="flex items-center justify-center gap-2.5 relative z-10">
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="text-sm tracking-wide">Iniciar Sesión</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" />
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        {/* ─── Footer ─── */}
        <p className="text-center text-[10px] text-text-tertiary/50 mt-8 font-medium tracking-wider">
          VISIONCONTROL v2.0 — POWERED BY FIBERLINK
        </p>
      </div>
    </div>
  );
}
