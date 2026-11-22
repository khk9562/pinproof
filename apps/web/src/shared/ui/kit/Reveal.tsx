import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type RevealVariant =
  | 'perspective-lift'
  | 'slide-left'
  | 'slide-right'
  | 'clip-unfold'
  | 'cascade-drop'
  | 'spring-pop';

export interface RevealProps {
  variant: RevealVariant;
  delayMs?: number;
  className?: string;
  children: ReactNode;
}

export function Reveal({ variant, delayMs = 0, className, children }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-visible={visible ? 'true' : 'false'}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn('reveal-base', `reveal-${variant}`, className)}
    >
      {children}
    </div>
  );
}
