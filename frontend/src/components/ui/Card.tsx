import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
}

export function Card({ children, className = '', hoverable = false }: CardProps) {
  return (
    <div className={`
      bg-bg-surface border border-glass-border rounded-2xl overflow-hidden
      ${hoverable ? 'transition-all duration-300 ease-out hover:-translate-y-1 hover:border-white/15 hover:shadow-[0_8px_32px_rgba(0,0,0,0.2),0_0_0_1px_rgba(255,255,255,0.05)] cursor-pointer' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}
