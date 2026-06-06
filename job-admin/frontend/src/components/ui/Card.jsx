import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const Card = ({ children, className, ...props }) => {
  return (
    <div 
      className={cn('bg-surface border border-border rounded-xl overflow-hidden', className)}
      {...props}
    >
      {children}
    </div>
  );
};

const CardSection = ({ children, className, variant = 'default', ...props }) => {
  const variants = {
    default: 'p-[18px_20px]',
    actions: 'p-[18px_20px] flex items-center gap-2 flex-wrap bg-surface-2 border-t border-border',
  };

  return (
    <div className={cn(variants[variant], className)} {...props}>
      {children}
    </div>
  );
};

const CardHeader = ({ title, desc, hint, children, className }) => {
  return (
    <div className={cn('flex items-start justify-between gap-3 mb-[14px]', className)}>
      <div>
        {title && <h3 className="font-display text-[13px] font-bold text-tx-1">{title}</h3>}
        {desc && <p className="text-[11.5px] text-tx-3 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      {hint && <span className="text-[10.5px] text-tx-3 font-mono shrink-0 mt-0.5">{hint}</span>}
      {children}
    </div>
  );
};

export { Card, CardSection, CardHeader };
