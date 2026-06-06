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
    default: 'bg-surface-2 border-border-2 text-tx-1 hover:bg-surface-3 hover:border-border-3 hover:shadow-lg',
    accent: 'bg-[var(--teal)] border-[var(--teal)] text-white font-bold shadow-[0_0_18px_rgba(20,184,166,0.3)] hover:brightness-110 hover:shadow-[0_0_28px_rgba(20,184,166,0.4),0_4px_14px_rgba(0,0,0,0.2)]',
    ghost: 'bg-transparent border-transparent text-gray-400 hover:bg-white/5 hover:text-white',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:shadow-[0_0_14px_rgba(59,130,246,0.12),0_4px_14px_rgba(0,0,0,0.15)]',
    danger: 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20',
  };

  const ghostStyles = {
    danger: 'bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400',
    default: 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5 hover:text-white',
    blue: 'bg-transparent border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-400',
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
        'inline-flex items-center gap-2 font-semibold rounded-md border cursor-pointer whitespace-nowrap transition-all duration-150 ease-out active:translate-y-0 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed',
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
