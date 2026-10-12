import React from 'react';

interface ShortStackLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'mark' | 'horizontal';
  showTagline?: boolean;
  light?: boolean;
}

export const ShortStackLogo: React.FC<ShortStackLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'horizontal',
  showTagline = false,
  light = false,
}) => {
  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const taglineSizes = {
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
    xl: 'text-sm',
  };

  const BrandMark = (
    <div
      className={`relative shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-neutral-900 via-neutral-950 to-black p-1.5 shadow-sm border border-neutral-800 ${iconSizes[size]}`}
      aria-hidden="true"
    >
      {/* Stacked Storefront / 'S' Brand Mark in Emerald, Silver, and Black */}
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="silverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f1f5f9" />
            <stop offset="50%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>

        {/* Top Tier: Storefront Awning Peak (Emerald Green) */}
        <path
          d="M8 12C8 9.79086 9.79086 8 12 8H24C26.2091 8 28 9.79086 28 12V13C28 14.1046 27.1046 15 26 15H10C8.89543 15 8 14.1046 8 13V12Z"
          fill="url(#emeraldGrad)"
        />
        {/* Awning Scallops (Silver accents) */}
        <circle cx="11.5" cy="15" r="1.5" fill="url(#silverGrad)" />
        <circle cx="16" cy="15" r="1.5" fill="url(#silverGrad)" />
        <circle cx="20.5" cy="15" r="1.5" fill="url(#silverGrad)" />
        <circle cx="25" cy="15" r="1.5" fill="url(#silverGrad)" />

        {/* Middle Tier: Stacked Mezzanine forming curved S spine */}
        <path
          d="M10 17H22C24.2091 17 26 18.7909 26 21C26 23.2091 24.2091 25 22 25H12C10.8954 25 10 24.1046 10 23V21C10 19.8954 10.8954 19 12 19H20"
          stroke="url(#silverGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Bottom Tier: Storefront Foundation & Doorway (Emerald accent) */}
        <path
          d="M8 24C8 23.4477 8.44772 23 9 23H15C15.5523 23 16 23.4477 16 24V28H8V24Z"
          fill="url(#emeraldGrad)"
        />
        <rect x="7" y="27" width="22" height="2" rx="1" fill="url(#silverGrad)" />

        {/* Modern Accent Star (Symbolizing Featured Quality) */}
        <path
          d="M26 10.5L26.6 11.9L28 12.1L26.9 13.1L27.2 14.5L26 13.8L24.8 14.5L25.1 13.1L24 12.1L25.4 11.9L26 10.5Z"
          fill="#34d399"
        />
      </svg>
    </div>
  );

  if (variant === 'mark') {
    return <div className={`inline-flex items-center ${className}`}>{BrandMark}</div>;
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {BrandMark}
      <div className="flex flex-col text-left leading-none">
        <div className="flex items-center gap-1">
          <span
            className={`font-extrabold font-display tracking-tight ${textSizes[size]} ${
              light ? 'text-white' : 'text-neutral-900'
            }`}
          >
            Short{' '}
            <span className="text-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              Stack
            </span>
          </span>
        </div>
        {(showTagline || variant === 'full') && (
          <span
            className={`font-semibold tracking-normal mt-0.5 ${taglineSizes[size]} ${
              light ? 'text-neutral-300' : 'text-neutral-500'
            }`}
          >
            Small Businesses. Big Deal.
          </span>
        )}
      </div>
    </div>
  );
};
