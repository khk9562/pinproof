import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export interface TicketCardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export function TicketCard({ elevated = false, className, ...props }: TicketCardProps) {
  return (
    <div
      className={cn(
        'rounded-[2px] border border-line bg-surface/92 backdrop-blur-sm',
        elevated && 'border-line-strong shadow-[0_24px_60px_-28px_rgb(0_0_0/0.45)]',
        className,
      )}
      {...props}
    />
  );
}
