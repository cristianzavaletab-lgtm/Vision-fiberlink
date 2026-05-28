

interface StatusDotProps {
  status: 'online' | 'offline' | 'warning';
  animate?: boolean;
}

export function StatusDot({ status, animate = true }: StatusDotProps) {
  const colors = {
    online: 'bg-status-success',
    offline: 'bg-status-error',
    warning: 'bg-status-warning',
  };

  return (
    <div className="relative flex items-center justify-center">
      <div className={`w-2.5 h-2.5 rounded-full ${colors[status]} z-10`} />
      {animate && status === 'online' && (
        <div className={`absolute w-2.5 h-2.5 rounded-full ${colors[status]} animate-ping opacity-75`} />
      )}
    </div>
  );
}
