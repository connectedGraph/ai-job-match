import React, { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../../constants/brand';

const BrandMark = ({
  className = '',
  logoSize = 'h-12 w-12',
  titleClassName = 'text-base',
  subtitleClassName = 'text-[10px]',
  subtitle = APP_TAGLINE,
  showSubtitle = true,
  inverse = false,
  stacked = false,
}) => {
  const [hasError, setHasError] = useState(false);

  const shellClassName = inverse
    ? 'border border-white/15 bg-white/10 shadow-[0_18px_40px_rgba(15,23,42,0.18)]'
    : 'border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]';

  const contentClassName = stacked
    ? 'flex flex-col items-center text-center gap-2'
    : 'flex items-center gap-3';

  const titleToneClassName = inverse ? 'text-white' : 'text-slate-900';
  const subtitleToneClassName = inverse ? 'text-white/70' : 'text-slate-500';
  const fallbackIconClassName = inverse ? 'text-white' : 'text-blue-600';

  return (
    <div className={`${contentClassName} ${className}`}>
      <div className={`flex ${logoSize} shrink-0 items-center justify-center overflow-hidden rounded-2xl ${shellClassName}`}>
        {hasError ? (
          <GraduationCap className={`h-1/2 w-1/2 ${fallbackIconClassName}`} />
        ) : (
          <img
            src="/logo.png"
            alt={APP_NAME}
            className="h-full w-full object-contain p-1.5"
            onError={() => setHasError(true)}
          />
        )}
      </div>

      <div className="leading-tight">
        <div className={`font-black tracking-tight ${titleClassName} ${titleToneClassName}`}>
          {APP_NAME}
        </div>
        {showSubtitle && (
          <div className={`font-bold uppercase tracking-[0.18em] ${subtitleClassName} ${subtitleToneClassName}`}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandMark;
