import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

export type ButtonVariant = 'default' | 'solid' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'default',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[2px] font-medium transition-colors duration-150 cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'default' &&
          'border border-line bg-surface text-ink hover:border-line-strong hover:bg-wash',
        variant === 'solid' &&
          'border border-ink bg-ink text-inverse hover:opacity-88',
        variant === 'ghost' &&
          'border border-transparent bg-transparent text-ink-soft hover:bg-wash hover:text-ink',
        variant === 'destructive' &&
          'border border-line-strong bg-wash text-ink font-semibold hover:bg-ink hover:text-inverse',
        size === 'sm' && 'h-8 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-sm',
        size === 'icon' && 'size-8 p-0',
        className,
      )}
      {...props}
    />
  );
}
