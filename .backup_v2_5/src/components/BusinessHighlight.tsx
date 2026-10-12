import React from 'react';
import { Business } from '../types/pipsqueak.ts';
import {
  Sparkles,
  MapPin,
  Star,
  Phone,
  ArrowUpRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface BusinessHighlightProps {
  businesses: Business[];
  locationQuery?: string;
  onOpenProfile: (id: string) => void;
  onContact: (business: Business) => void;
}

/**
 * Deterministically picks a business for the current 24-hour UTC window.
 * Rotates every day at 00:00 UTC fairly across eligible active paid businesses.
 * If a consumer city is detected/selected, prioritizes businesses in that city;
 * if none qualify in that city, seamlessly expands to all eligible businesses.
 */
function getDailyHighlight(eligible: Business[], locationQuery?: string): Business | null {
  if (eligible.length === 0) return null;

  let pool = eligible;
  if (locationQuery && locationQuery.trim()) {
    const locClean = locationQuery.trim().toLowerCase();
    const cityMatches = eligible.filter(
      (b) =>
        b.city?.toLowerCase().includes(locClean) ||
        b.state?.toLowerCase().includes(locClean) ||
        b.serviceArea?.toLowerCase().includes(locClean) ||
        b.zipCode?.includes(locClean)
    );
    // If qualified businesses exist in this location, use them; otherwise expand to nearby
    if (cityMatches.length > 0) {
      pool = cityMatches;
    }
  }

  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash << 5) - hash + dateKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % pool.length;
  return pool[index];
}

export const BusinessHighlight: React.FC<BusinessHighlightProps> = ({
  businesses,
  locationQuery,
  onOpenProfile,
  onContact,
}) => {
  // Only active, public, paid listings are eligible
  const eligible = businesses.filter(
    (b) => b.status === 'active' && (!b.billing || b.billing.status === 'paid')
  );

  const highlight = getDailyHighlight(eligible, locationQuery);

  if (!highlight) return null;

  const photo = highlight.photos?.[0];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/20 bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-white shadow-xl">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative p-6 sm:p-10 lg:p-12">
          {/* Header Tag */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-neutral-800">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>TODAY'S BUSINESS HIGHLIGHT</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Rotates every 24 hours · Free community spotlight</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Visual Media Container */}
            <div className="lg:col-span-5 aspect-16/10 sm:aspect-16/9 lg:aspect-4/3 rounded-xl overflow-hidden bg-neutral-800 border border-neutral-700 relative group">
              {photo ? (
                <img
                  src={photo}
                  alt={highlight.name}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-neutral-400">
                  <Sparkles className="w-12 h-12 text-emerald-500/40 mb-2" />
                  <span className="text-sm font-medium">{highlight.name}</span>
                </div>
              )}
              <div className="absolute top-3 left-3 bg-neutral-900/85 backdrop-blur-xs px-2.5 py-1 rounded-md text-[11px] font-mono text-emerald-400 border border-neutral-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Verified Active
              </div>
            </div>

            {/* Content Details */}
            <div className="lg:col-span-7 space-y-4 text-left">
              <div>
                <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
                  <span className="text-emerald-400 font-medium">{highlight.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{highlight.city}, {highlight.state}</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
                  {highlight.name}
                </h3>

                {/* Rating */}
                {highlight.ratingCount && highlight.ratingCount > 0 && highlight.averageRating ? (
                  <div className="flex items-center gap-1.5 text-xs mt-2">
                    <div className="flex items-center text-amber-400">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= Math.round(highlight.averageRating!)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-neutral-700'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-bold text-white">{highlight.averageRating.toFixed(1)}</span>
                    <span className="text-neutral-400">
                      ({highlight.ratingCount} {highlight.ratingCount === 1 ? 'review' : 'reviews'})
                    </span>
                  </div>
                ) : null}
              </div>

              <p className="text-sm text-neutral-300 leading-relaxed max-w-xl">
                {highlight.shortDescription}
              </p>

              {/* Service tags / keywords */}
              {highlight.keywords && highlight.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-neutral-400 pt-1">
                  {highlight.keywords.slice(0, 5).map((kw, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 text-[11px]"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>
              )}

              {/* Location and service area */}
              <div className="flex items-center gap-2 text-xs text-neutral-400 pt-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  {highlight.address ? `${highlight.address}, ` : ''}
                  {highlight.city}, {highlight.state}
                  {highlight.serviceArea ? ` (Serving: ${highlight.serviceArea})` : ''}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onContact(highlight)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-neutral-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>CONTACT</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenProfile(highlight.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
                >
                  <span>View Full Profile</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
