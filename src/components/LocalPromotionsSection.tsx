import React from 'react';
import type { Business } from '../types/pipsqueak.ts';
import { Tag, ArrowUpRight, Phone, Sparkles, MapPin } from 'lucide-react';
import { calculateDistanceMiles } from '../utils/smartSearch.ts';

interface LocalPromotionsSectionProps {
  businesses: Business[];
  userCoords?: { lat: number; lng: number } | null;
  onOpenProfile: (id: string) => void;
  onContact: (business: Business) => void;
}

export const LocalPromotionsSection: React.FC<LocalPromotionsSectionProps> = ({
  businesses,
  userCoords,
  onOpenProfile,
  onContact,
}) => {
  // Only eligible active, paid, public businesses within 25 miles of consumer location
  const promotionalBusinesses = businesses.filter((b) => {
    if (b.status !== 'active') return false;
    if (b.billing && b.billing.status !== 'paid') {
      return false;
    }
    if (!b.flyer || b.flyer.status !== 'published' || (!b.flyer.headline && !b.flyer.offerDetails)) {
      return false;
    }
    // Fixed 25-mile radius constraint when consumer coordinates are available
    if (userCoords && b.lat && b.lng) {
      const dist = calculateDistanceMiles(userCoords.lat, userCoords.lng, b.lat, b.lng);
      if (dist !== null && dist > 25) return false;
    }
    return true;
  });

  if (promotionalBusinesses.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-baseline justify-between border-b border-neutral-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-600" />
            <h2 className="text-xl font-bold font-display text-neutral-900">
              Local Promotions & Special Offers
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Direct-to-consumer specials from local businesses within a 25-mile radius. No middleman codes required.
          </p>
        </div>
        <span className="text-xs font-mono text-neutral-400">
          {promotionalBusinesses.length} active {promotionalBusinesses.length === 1 ? 'offer' : 'offers'} · 25mi radius
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {promotionalBusinesses.map((biz) => {
          const flyer = biz.flyer!;
          const dist =
            userCoords && biz.lat && biz.lng
              ? calculateDistanceMiles(userCoords.lat, userCoords.lng, biz.lat, biz.lng)
              : null;

          return (
            <article
              key={biz.id}
              className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs hover:border-neutral-300 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Optional Flyer Image */}
                {flyer.photoUrl ? (
                  <div className="aspect-16/9 bg-neutral-100 overflow-hidden relative">
                    <img
                      src={flyer.photoUrl}
                      alt={flyer.headline}
                      className="w-full h-full object-cover hover:scale-102 transition-transform duration-300"
                    />
                    <div className="absolute top-2.5 left-2.5 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shadow-xs">
                      Promotion
                    </div>

                    {dist !== null && (
                      <div className="absolute top-2.5 right-2.5 bg-neutral-900/80 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-xs">
                        {dist < 1 ? '<1 mi away' : `${dist.toFixed(1)} mi away`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded">
                      Special Offer
                    </span>
                    <div className="flex items-center gap-2">
                      {dist !== null && (
                        <span className="text-[10px] font-mono text-neutral-600">
                          {dist < 1 ? '<1 mi' : `${dist.toFixed(1)} mi`}
                        </span>
                      )}
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                  </div>
                )}

                <div className="p-5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-neutral-500">
                    <span className="font-semibold text-neutral-800">{biz.name}</span>
                    <span>{biz.city}, {biz.state}</span>
                  </div>

                  <h3 className="text-base font-bold font-display text-neutral-900 leading-snug">
                    {flyer.headline}
                  </h3>

                  {flyer.offerDetails && (
                    <p className="text-xs text-neutral-600 leading-relaxed line-clamp-3">
                      {flyer.offerDetails}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="p-4 pt-3 border-t border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onContact(biz)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs"
                >
                  <Phone className="w-3 h-3" />
                  <span>Contact</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenProfile(biz.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition-colors"
                >
                  <span>View Profile</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
