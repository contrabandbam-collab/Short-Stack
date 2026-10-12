import { Business } from '../types/pipsqueak.ts';

const STOP_WORDS = new Set([
  'i',
  'need',
  'someone',
  'who',
  'to',
  'a',
  'an',
  'the',
  'for',
  'my',
  'near',
  'me',
  'find',
  'looking',
  'can',
  'help',
  'with',
  'around',
  'here',
  'local',
  'best',
  'good',
  'please',
  'any',
  'where',
  'is',
  'there',
  'in',
  'at',
  'and',
  'or',
]);

const INTENT_SYNONYMS: Record<string, string[]> = {
  brake: ['brake', 'brakes', 'auto', 'automotive', 'mechanic', 'car', 'repair'],
  brakes: ['brake', 'brakes', 'auto', 'automotive', 'mechanic', 'car', 'repair'],
  mechanic: ['mechanic', 'auto', 'automotive', 'repair', 'garage', 'car', 'truck'],
  barber: ['barber', 'hair', 'haircut', 'salon', 'fade', 'shave', 'styling', 'stylist'],
  haircut: ['barber', 'hair', 'haircut', 'salon', 'styling', 'fade'],
  salon: ['salon', 'hair', 'haircut', 'barber', 'beauty', 'spa', 'nails'],
  appliance: ['appliance', 'appliances', 'install', 'home', 'contractor', 'repair', 'hvac', 'plumbing'],
  appliances: ['appliance', 'appliances', 'install', 'home', 'contractor', 'repair', 'hvac', 'plumbing'],
  install: ['install', 'installation', 'appliance', 'home', 'repair', 'contractor', 'electrician', 'plumber'],
  installs: ['install', 'installation', 'appliance', 'home', 'repair', 'contractor'],
  cake: ['cake', 'cakes', 'bakery', 'birthday', 'pastry', 'dessert', 'baking', 'bistro', 'food'],
  birthday: ['cake', 'birthday', 'party', 'bakery', 'custom', 'catering', 'event'],
  bakery: ['bakery', 'cake', 'bread', 'pastry', 'dessert', 'coffee', 'baking'],
  groomer: ['groomer', 'grooming', 'pet', 'dog', 'cat', 'wash', 'puppy'],
  grooming: ['groomer', 'grooming', 'pet', 'dog', 'cat', 'wash', 'puppy'],
  dog: ['dog', 'pet', 'grooming', 'veterinary', 'puppy', 'canine', 'animal'],
  cat: ['cat', 'pet', 'grooming', 'feline', 'animal'],
  mobile: ['mobile', 'service_area', 'on-site', 'traveling', 'doorstep'],
  plumber: ['plumber', 'plumbing', 'pipe', 'leak', 'drain', 'water', 'home'],
  electrician: ['electrician', 'electrical', 'wiring', 'lighting', 'power'],
  coffee: ['coffee', 'espresso', 'cafe', 'roaster', 'bakery', 'tea', 'latte'],
  food: ['food', 'restaurant', 'dining', 'bistro', 'menu', 'catering', 'eats'],
  restaurant: ['restaurant', 'dining', 'food', 'bistro', 'eats', 'menu'],
  repair: ['repair', 'service', 'fix', 'maintenance', 'contractor'],
  fix: ['fix', 'repair', 'service', 'maintenance'],
};

/**
 * Returns contextual on-screen commentary for searches.
 * Suppresses humor for medical, legal, emergency, or safety queries.
 * Provides short, playful, friendly commentary for ordinary everyday needs.
 */
export function getSearchCommentary(query: string, matchCount: number): string | null {
  const clean = query.trim().toLowerCase();
  if (!clean) return null;

  const SERIOUS_KEYWORDS = [
    'doctor',
    'medical',
    'emergency',
    'urgent',
    'hospital',
    'lawyer',
    'attorney',
    'legal',
    'dentist',
    'clinic',
    'injur',
    'police',
    'ambulance',
    'trauma',
    'health',
    'safety',
    'fire',
  ];

  const isSerious = SERIOUS_KEYWORDS.some((kw) => clean.includes(kw));

  if (isSerious) {
    return matchCount > 0
      ? `Showing verified professional healthcare, legal, and essential safety providers matching "${query}".`
      : `No immediate provider matches for "${query}". Please verify emergency services directly or broaden search radius.`;
  }

  // Playful, friendly ordinary search commentary
  if (clean.includes('brake') || clean.includes('mechanic') || clean.includes('car')) {
    return 'Safety first and squeaky brakes last — here are neighborhood mechanics who know their tools.';
  }
  if (clean.includes('barber') || clean.includes('hair') || clean.includes('fade') || clean.includes('salon')) {
    return 'Looking sharp already! Here are local barbers and stylists with open chairs.';
  }
  if (clean.includes('cake') || clean.includes('birthday') || clean.includes('bakery')) {
    return 'A sweet celebration ahead! Here are independent bakeries crafting custom treats.';
  }
  if (clean.includes('dog') || clean.includes('cat') || clean.includes('pet') || clean.includes('groom')) {
    return 'Tail-wagging approval ahead! Found neighborhood pet specialists ready to pamper your companion.';
  }
  if (clean.includes('plumb') || clean.includes('pipe') || clean.includes('leak') || clean.includes('drain')) {
    return 'No time to let leaks linger! Here are top-rated local plumbers ready to dive in.';
  }
  if (clean.includes('food') || clean.includes('restaurant') || clean.includes('eat') || clean.includes('bistro') || clean.includes('dinner')) {
    return 'Good call — someone’s getting hungry! Here are local kitchens ready to satisfy the craving.';
  }

  return matchCount > 0
    ? `On it! Found ${matchCount} authentic independent local spot${matchCount === 1 ? '' : 's'} matching your search.`
    : `Didn't find an exact match for "${query}". Try broadening your terms or expanding the search distance.`;
}

/**
 * Calculates straight-line distance in miles between two coordinates (Haversine formula)
 */
export function calculateDistanceMiles(
  lat1?: number,
  lon1?: number,
  lat2?: number,
  lon2?: number
): number | null {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return null;
  }

  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Smart Search Intent Matcher
 * Understands natural language needs (e.g. "I need someone to fix my brakes", "barber near me")
 * Searches business name, description, services, menu, keywords, categories, custom categories,
 * flyer promotions, mobile business types, city, ZIP, and service area.
 */
export function matchBusinessSmartSearch(
  b: Business,
  query: string,
  locationQuery?: string
): boolean {
  if (locationQuery && locationQuery.trim()) {
    const loc = locationQuery.toLowerCase().trim();
    if (loc !== 'current location') {
      const inCity = b.city?.toLowerCase().includes(loc);
      const inState = b.state?.toLowerCase().includes(loc);
      const inZip = b.zipCode?.includes(loc);
      const inArea = b.serviceArea?.toLowerCase().includes(loc);
      const inAddr = b.address?.toLowerCase().includes(loc);
      if (!inCity && !inState && !inZip && !inArea && !inAddr) {
        return false;
      }
    }
  }

  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return true;

  // Build searchable text corpus for this business
  const corpusParts = [
    b.name,
    b.shortDescription,
    b.category,
    b.subcategory || '',
    b.customCategory || '',
    b.customSubcategory || '',
    b.serviceArea || '',
    b.city || '',
    b.address || '',
    b.zipCode || '',
    ...(b.keywords || []),
    ...(b.services || []).map((s) => `${s.name} ${s.description}`),
    ...(b.menuItems || []).map((m) => `${m.name} ${m.description} ${m.category || ''}`),
    b.flyer?.headline || '',
    b.flyer?.offerDetails || '',
    b.isServiceAreaOnly || b.locationType === 'service_area' ? 'mobile service area traveling' : '',
  ];
  const fullText = corpusParts.join(' ').toLowerCase();

  // 1. Direct whole-substring match
  if (fullText.includes(cleanQ)) {
    return true;
  }

  // 2. Tokenize into intent terms
  const rawWords = cleanQ.split(/[\s,./!?;:()"-]+/).filter(Boolean);
  const coreWords = rawWords.filter((w) => !STOP_WORDS.has(w));
  const queryTokens = coreWords.length > 0 ? coreWords : rawWords;

  if (queryTokens.length === 0) return true;

  // Match every query token or its synonyms in the corpus
  const allTokensMatched = queryTokens.every((token) => {
    if (fullText.includes(token)) return true;

    // Check singular/plural stemming
    const stemmed = token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
    if (fullText.includes(stemmed)) return true;

    // Check intent synonyms
    const synonyms = INTENT_SYNONYMS[token] || INTENT_SYNONYMS[stemmed];
    if (synonyms) {
      return synonyms.some((syn) => fullText.includes(syn));
    }

    return false;
  });

  return allTokensMatched;
}
