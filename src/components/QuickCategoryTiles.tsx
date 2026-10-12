import React from 'react';
import type { Category, Business } from '../types/pipsqueak.ts';
import { Sparkles, ArrowRight } from 'lucide-react';

interface QuickCategoryTilesProps {
  categories: Category[];
  businesses: Business[];
  onSelectCategory: (categoryId: string, categoryName: string) => void;
}

// Fallback high-quality curated images for standard directory categories
const CATEGORY_IMAGE_MAP: Record<string, string> = {
  dining: '/images/pipsqueak_restaurant_bistro_1791171557687.jpg',
  automotive: '/images/pipsqueak_automotive_garage_1791171572958.jpg',
  home_services: '/images/pipsqueak_home_craftsman_1791171582249.jpg',
  pets: '/images/pipsqueak_pet_grooming_1791171590899.jpg',
  bakeries: '/images/pipsqueak_restaurant_menu_1791171631325.jpg',
  services: '/images/pipsqueak_home_craftsman_1791171582249.jpg',
};

const DEFAULT_TILES = [
  {
    id: 'dining',
    name: 'Dining & Restaurants',
    image: '/images/pipsqueak_restaurant_bistro_1791171557687.jpg',
    tagline: 'Scratch kitchens & neighborhood bistros',
  },
  {
    id: 'automotive',
    name: 'Auto & Mechanics',
    image: '/images/pipsqueak_automotive_garage_1791171572958.jpg',
    tagline: 'Brakes, diagnostics & honest repair',
  },
  {
    id: 'home_services',
    name: 'Home & Trades',
    image: '/images/pipsqueak_home_craftsman_1791171582249.jpg',
    tagline: 'Electricians, plumbers & craftsmen',
  },
  {
    id: 'pets',
    name: 'Pets & Grooming',
    image: '/images/pipsqueak_pet_grooming_1791171590899.jpg',
    tagline: 'Gentle grooming, care & boarding',
  },
];

/**
 * Deterministically picks exactly FOUR quick category tiles for the current 24-hour UTC window.
 * Rotates daily based on date and variety protections.
 */
function getDailyFourTiles(categories: Category[], businesses: Business[]) {
  if (categories.length === 0) return DEFAULT_TILES;

  const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) {
    seed = (seed << 5) - seed + dateKey.charCodeAt(i);
    seed |= 0;
  }
  const offset = Math.abs(seed) % categories.length;

  // Circular rotation of categories to pick 4 distinct categories
  const rotated: Category[] = [];
  for (let i = 0; i < categories.length; i++) {
    rotated.push(categories[(offset + i) % categories.length]);
  }

  const selectedCats = rotated.slice(0, 4);

  return selectedCats.map((cat, idx) => {
    // Find an active business photo in this category if available, or fall back to curated map
    const bizInCat = businesses.find((b) => b.category === cat.id && b.photos && b.photos.length > 0);
    const photo =
      bizInCat?.photos[0] ||
      CATEGORY_IMAGE_MAP[cat.id] ||
      DEFAULT_TILES[idx % DEFAULT_TILES.length].image;

    const count = businesses.filter((b) => b.category === cat.id && b.status === 'active').length;

    return {
      id: cat.id,
      name: cat.name,
      image: photo,
      tagline: cat.description || (count > 0 ? `${count} local options` : 'Explore directory category'),
      count,
    };
  });
}

export const QuickCategoryTiles: React.FC<QuickCategoryTilesProps> = ({
  categories,
  businesses,
  onSelectCategory,
}) => {
  const tiles = getDailyFourTiles(categories, businesses);

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between text-xs text-neutral-200 mb-3 px-1 font-medium">
        <div className="flex items-center gap-1.5 drop-shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Quick Category Tiles · Rotates every 24h</span>
        </div>
        <span className="text-[11px] text-neutral-300 hidden sm:inline drop-shadow-sm">
          Tap any tile for instant listings
        </span>
      </div>

      {/* Exactly FOUR photo tiles with responsive grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelectCategory(tile.id, tile.name)}
            className="group relative h-36 sm:h-40 rounded-xl overflow-hidden border border-white/20 shadow-md text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {/* Background Photo */}
            <img
              src={tile.image}
              alt={tile.name}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />

            {/* Dark Gradient Overlay for Readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10 group-hover:from-black/95 transition-colors" />

            {/* Content Text */}
            <div className="relative h-full p-3.5 flex flex-col justify-end text-white">
              <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-semibold mb-0.5">
                Quick Category
              </span>
              <h3 className="text-sm sm:text-base font-bold font-display leading-tight tracking-tight drop-shadow-sm">
                {tile.name}
              </h3>
              <p className="text-[11px] text-neutral-300 line-clamp-1 mt-0.5 group-hover:text-white transition-colors">
                {tile.tagline}
              </p>

              <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-400 font-medium opacity-90 group-hover:opacity-100">
                <span>Explore</span>
                <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
