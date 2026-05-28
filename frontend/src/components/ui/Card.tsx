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
      ${hoverable ? 'transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}
