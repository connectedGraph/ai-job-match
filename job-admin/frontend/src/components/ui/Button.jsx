import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const Button = ({ 
  children, 
  className, 
  variant = 'default', 
  ghost = false,
  size = 'md', 
  ...props 
}) => {
  const variants = {
    default: 'bg-surface-2 border-border-2 text-tx-1 hover:bg-surface-3 hover:border-border-3 hover:shadow-lg dark:hover:shadow-[0_4px_14px_rgba(0,0,0,0.3)]',
    accent: 'bg-teal border-teal text-tx-inv font-bold shadow-[0_0_18px_var(--teal-glow)] hover:brightness-110 hover:shadow-[0_0_28px_var(--teal-glow),0_4px_14px_rgba(0,0,0,0.2)]',
    ghost: 'bg-transparent border-border text-tx-2 hover:bg-surface-2 hover:text-tx-1',
    blue: 'bg-blue-dim border-blue-border text-blue hover:bg-blue-dim/20 hover:shadow-[0_0_14px_rgba(96,165,250,0.12),0_4px_14px_rgba(0,0,0,0.15)]',
    danger: 'bg-red-dim border-red-border text-red hover:brightness-110',
  };

  const ghostStyles = {
    danger: 'bg-transparent border-red-border/30 text-red hover:bg-red-dim hover:text-red',
    default: 'bg-transparent border-border text-tx-2 hover:bg-surface-2 hover:text-tx-1',
    blue: 'bg-transparent border-blue-border/30 text-blue hover:bg-blue-dim hover:text-blue',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-[12.5px] px-4 py-2',
    lg: 'text-sm px-6 py-3',
  };

  const appliedVariant = (variant === 'ghost' || ghost) ? (ghostStyles[variant] || ghostStyles.default) : variants[variant];

  return (
    <button 
      className={cn(
        'inline-flex items-center gap-2 font-semibold rounded-sm border cursor-pointer whitespace-nowrap transition-all duration-110 ease-out active:translate-y-0 active:shadow-none',
        appliedVariant,
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
