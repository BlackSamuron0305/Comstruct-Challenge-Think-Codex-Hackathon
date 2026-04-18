import * as React from 'react';

import { cn } from '../../lib/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
};

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-brand text-brand-surface hover:bg-brand-ink',
  outline:
    'border border-brand-line bg-brand-surface text-slate-900 shadow-[0_14px_28px_rgba(15,23,42,0.06)] hover:border-brand/40 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]',
  ghost: 'bg-transparent text-slate-900 hover:bg-white/70',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
