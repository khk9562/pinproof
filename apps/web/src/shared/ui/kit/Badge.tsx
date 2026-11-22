import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export type BadgeVariant = 'outline' | 'solid' | 'wash';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'outline', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[11px] font-medium leading-tight tabular-nums',
        variant === 'outline' && 'border border-line bg-transparent text-ink-soft',
        variant === 'solid' && 'border border-ink bg-ink text-inverse',
        variant === 'wash' && 'border border-transparent bg-wash-strong text-ink',
        className,
      )}
      {...props}
    />
  );
}
