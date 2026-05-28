import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral' | 'brand';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className = '' }: BadgeProps) {
  const variants = {
    success: 'bg-status-success/10 text-status-success border-status-success/20',
    error: 'bg-status-error/10 text-status-error border-status-error/20',
    warning: 'bg-status-warning/10 text-status-warning border-status-warning/20',
    info: 'bg-status-info/10 text-status-info border-status-info/20',
    neutral: 'bg-bg-highlight text-text-secondary border-glass-border',
    brand: 'bg-brand/10 text-brand border-brand/20',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
