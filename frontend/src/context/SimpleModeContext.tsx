import React, { createContext, useContext, useState, useEffect } from 'react';

interface SimpleModeContextType {
  isSimpleMode: boolean;
  toggleSimpleMode: () => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  highContrast: boolean;
  toggleHighContrast: () => void;
}

const SimpleModeContext = createContext<SimpleModeContextType | undefined>(undefined);

export function SimpleModeProvider({ children }: { children: React.ReactNode }) {
  const [isSimpleMode] = useState(false); // Siempre muestra la interfaz completa (esencia)

  const [fontSize, setFontSizeState] = useState(() => {
    return parseInt(localStorage.getItem('fontSize') || '16');
  });

  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('highContrast') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('simpleMode', isSimpleMode.toString());
    if (isSimpleMode) {
      document.body.classList.add('modo-simple');
    } else {
      document.body.classList.remove('modo-simple');
    }
  }, [isSimpleMode]);

  useEffect(() => {
    localStorage.setItem('fontSize', fontSize.toString());
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('highContrast', highContrast.toString());
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);
  const toggleSimpleMode = () => {}; // Simple mode is forced to always be true
  const setFontSize = (size: number) => setFontSizeState(Math.max(12, Math.min(28, size)));
  const zoomIn = () => setFontSize(fontSize + 2);
  const zoomOut = () => setFontSize(fontSize - 2);
  const resetZoom = () => setFontSize(16);
  const toggleHighContrast = () => setHighContrast(prev => !prev);

  return (
    <SimpleModeContext.Provider value={{ isSimpleMode, toggleSimpleMode, fontSize, setFontSize, zoomIn, zoomOut, resetZoom, highContrast, toggleHighContrast }}>
      {children}
    </SimpleModeContext.Provider>
  );
}

export function useSimpleMode() {
  const context = useContext(SimpleModeContext);
  if (context === undefined) {
    throw new Error('useSimpleMode must be used within a SimpleModeProvider');
  }
  return context;
}
