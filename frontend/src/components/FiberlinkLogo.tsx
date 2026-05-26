import React from 'react';

export function FiberlinkLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background circle */}
      <rect width="48" height="48" rx="12" fill="url(#grad)" />
      
      {/* WiFi/Signal arcs */}
      <path d="M24 36a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="white"/>
      <path d="M18.5 29.5a7.5 7.5 0 0 1 11 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9"/>
      <path d="M14 25a14 14 0 0 1 20 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7"/>
      <path d="M10 20.5a20 20 0 0 1 28 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5"/>
      
      {/* Fiber optic line accent */}
      <path d="M24 34V42" stroke="url(#lineGrad)" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#FF6B35"/>
          <stop offset="100%" stopColor="#FF4500"/>
        </linearGradient>
        <linearGradient id="lineGrad" x1="24" y1="34" x2="24" y2="42">
          <stop offset="0%" stopColor="white"/>
          <stop offset="100%" stopColor="transparent"/>
        </linearGradient>
      </defs>
    </svg>
  );
}
