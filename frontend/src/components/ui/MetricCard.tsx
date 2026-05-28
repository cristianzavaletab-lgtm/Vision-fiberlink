import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  highlightColor?: 'brand' | 'success' | 'warning' | 'error';
}

export function MetricCard({ title, value, icon: Icon, trend, highlightColor = 'brand' }: MetricCardProps) {
  const highlightStyles = {
    brand: 'text-brand bg-brand/10 shadow-[0_0_15px_rgba(255,107,53,0.15)]',
    success: 'text-status-success bg-status-success/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
    warning: 'text-status-warning bg-status-warning/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
    error: 'text-status-error bg-status-error/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
  };

  return (
    <Card hoverable className="p-6 relative overflow-hidden group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${highlightStyles[highlightColor]} transition-transform duration-300 group-hover:scale-110`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <span className={`text-sm font-semibold flex items-center gap-1 ${trend.isPositive ? 'text-status-success' : 'text-status-error'}`}>
            {trend.isPositive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <div>
        <h4 className="text-text-secondary text-sm font-medium mb-1">{title}</h4>
        <div className="text-3xl font-bold text-text-primary tracking-tight">{value}</div>
      </div>
      
      {/* Decorative gradient blur */}
      <div className={`absolute -right-10 -bottom-10 w-32 h-32 rounded-full blur-[50px] opacity-20 pointer-events-none transition-opacity duration-500 group-hover:opacity-40 ${highlightStyles[highlightColor].split(' ')[0].replace('text-', 'bg-')}`} />
    </Card>
  );
}
