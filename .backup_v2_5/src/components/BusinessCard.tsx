import React, { useState } from 'react';
import { Business, Category } from '../types/pipsqueak.ts';
import { MapPin, QrCode, ArrowUpRight, Image as ImageIcon, Clock } from 'lucide-react';

interface BusinessCardProps {
  business: Business;
  category?: Category;
  distanceMiles?: number;
  onOpenProfile: (id: string) => void;
  onShowQR: (b: Business) => void;
}

/**
 * Computes live operating status (Open Now / Closed / By Appointment Only)
 */
function getOperatingStatus(business: Business): {
  label: string;
  isOpen: boolean;
  isAppointment: boolean;
} {
  if (business.hours) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const today = days[new Date().getDay()];
    const todaySchedule = (business.hours as any)[today]?.trim();

    if (todaySchedule) {
      const lower = todaySchedule.toLowerCase();
      if (lower.includes('appointment')) {
        return { label: 'By Appointment', isOpen: true, isAppointment: true };
      }
      if (lower === 'closed') {
        return { label: 'Closed Today', isOpen: false, isAppointment: false };
      }
      return { label: 'Open Today', isOpen: true, isAppointment: false };
    }
  }

  if (business.locationType === 'service_area') {
    return { label: 'By Appointment', isOpen: true, isAppointment: true };
  }

  return { label: 'Open Now', isOpen: true, isAppointment: false };
}

export const BusinessCard: React.FC<BusinessCardProps> = ({
  business,
  category,
  distanceMiles,
  onOpenProfile,
  onShowQR,
}) => {
  const [imageError, setImageError] = useState(false);
  const photoUrl = business.photos?.[0];
  const status = getOperatingStatus(business);

  return (
    <article className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:border-neutral-300 transition-all flex flex-col h-full shadow-2xs hover:shadow-md">
      {/* Visual Asset Container */}
      <div className="relative aspect-16/9 bg-neutral-100 overflow-hidden">
        {photoUrl && !imageError ? (
          <img
            src={photoUrl}
            alt={business.name}
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-100 text-neutral-400">
            <ImageIcon className="w-8 h-8 stroke-1 text-neutral-300 mb-1" />
            <span className="text-xs font-medium text-neutral-400">
              {category?.name || 'Local Business'}
            </span>
          </div>
        )}

        {/* Operating status badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide backdrop-blur-xs shadow-xs ${
              status.isOpen && !status.isAppointment
                ? 'bg-emerald-600/90 text-white'
                : status.isAppointment
                ? 'bg-blue-600/90 text-white'
                : 'bg-neutral-800/80 text-neutral-200'
            }`}
          >
            {status.label}
          </span>

          {distanceMiles !== undefined && (
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-neutral-900/80 text-white backdrop-blur-xs">
              {distanceMiles < 1 ? '<1 mi' : `${distanceMiles.toFixed(1)} mi`}
            </span>
          )}
        </div>

        {/* Permanent QR button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowQR(business);
          }}
          className="absolute top-2.5 right-2.5 p-2 bg-white/90 hover:bg-white text-neutral-700 hover:text-neutral-900 rounded-lg backdrop-blur-xs shadow-xs transition-colors"
          title="View Permanent Profile QR Code"
          aria-label="View QR Code"
        >
          <QrCode className="w-4 h-4" />
        </button>
      </div>

      {/* Card Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          {/* Metadata Kicker */}
          <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
            <span className="font-medium text-neutral-700">{category?.name || business.category}</span>
            <span aria-hidden="true">·</span>
            <span>{business.city}, {business.state}</span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg font-semibold text-neutral-900 font-display tracking-tight group-hover:text-neutral-700 transition-colors">
              <button
                onClick={() => onOpenProfile(business.id)}
                className="text-left w-full focus:outline-none"
              >
                {business.name}
              </button>
            </h3>
          </div>

          {/* Rating Line */}
          <div className="flex items-center gap-1.5 text-xs mt-1">
            {business.ratingCount && business.ratingCount > 0 && business.averageRating ? (
              <>
                <span className="text-amber-500 font-bold">★</span>
                <span className="font-semibold text-neutral-900">{business.averageRating.toFixed(1)}</span>
                <span className="text-neutral-500">({business.ratingCount} {business.ratingCount === 1 ? 'review' : 'reviews'})</span>
              </>
            ) : (
              <span className="text-neutral-400 italic">No reviews yet</span>
            )}
          </div>

          <p className="text-xs text-neutral-600 line-clamp-2 mt-2 leading-relaxed">
            {business.shortDescription}
          </p>

          {/* Unboxed Keywords / Service Tags */}
          {business.keywords && business.keywords.length > 0 && (
            <div className="mt-3 text-xs text-neutral-500 flex flex-wrap gap-x-2 gap-y-1">
              {business.keywords.slice(0, 3).map((kw, idx) => (
                <span key={idx}>
                  #{kw}
                </span>
              ))}
              {business.keywords.length > 3 && (
                <span className="text-neutral-400">+{business.keywords.length - 3} more</span>
              )}
            </div>
          )}
        </div>

        {/* Card Footer: Location & Action */}
        <div className="pt-4 mt-4 border-t border-neutral-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-neutral-500 truncate max-w-[65%]">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
            <span className="truncate">{business.serviceArea || business.address || `${business.city}, ${business.state}`}</span>
          </div>

          <button
            onClick={() => onOpenProfile(business.id)}
            className="inline-flex items-center gap-1 font-semibold text-neutral-900 hover:text-neutral-600 transition-colors"
          >
            <span>View Profile</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
};
