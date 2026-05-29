import { useState, useEffect, useRef } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  viewKey: string;
}

export function PageTransition({ children, viewKey }: PageTransitionProps) {
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevKeyRef = useRef(viewKey);

  useEffect(() => {
    if (prevKeyRef.current !== viewKey) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayedChildren(children);
        setIsTransitioning(false);
        prevKeyRef.current = viewKey;
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setDisplayedChildren(children);
    }
  }, [viewKey, children]);

  return (
    <div
      className={`transition-all duration-300 ease-out ${
        isTransitioning
          ? 'opacity-0 translate-y-2 scale-[0.99]'
          : 'opacity-100 translate-y-0 scale-100'
      }`}
    >
      {displayedChildren}
    </div>
  );
}
