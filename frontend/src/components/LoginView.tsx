import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';

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

    // Simular tiempo de carga para el diseño
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
    <div className="min-h-screen w-full bg-bg-base flex items-center justify-center relative overflow-hidden">
      {/* Elementos decorativos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-brand-secondary/10 blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>

      <div className="w-full max-w-md p-8 relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary p-[1px] shadow-2xl shadow-brand-primary/20 mb-6 group cursor-pointer transition-transform hover:scale-105">
            <div className="w-full h-full bg-bg-surface rounded-[15px] flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-brand-primary group-hover:scale-110 transition-transform duration-300" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Vision<span className="text-brand-primary">Control</span></h1>
          <p className="text-text-secondary text-sm">Panel de Administración Central</p>
        </div>

        <div className="bg-bg-surface/80 backdrop-blur-xl border border-bg-elevated p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          {/* Brillo sutil superior */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-brand-primary/50 to-transparent opacity-50" />
          
          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-text-tertiary mb-2 ml-1">
                Usuario
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-brand-primary transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-bg-base/50 border border-bg-elevated text-text-primary rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-text-tertiary"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold tracking-wider uppercase text-text-tertiary mb-2 ml-1">
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-brand-primary transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-base/50 border border-bg-elevated text-text-primary rounded-xl pl-12 pr-12 py-3.5 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all placeholder:text-text-tertiary"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 animate-in shake duration-300">
                <ShieldCheck className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-400 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full relative group overflow-hidden bg-brand-primary text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:bg-brand-secondary active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none shadow-lg shadow-brand-primary/20"
            >
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.2),transparent)] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-center gap-2">
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Iniciar Sesión</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
