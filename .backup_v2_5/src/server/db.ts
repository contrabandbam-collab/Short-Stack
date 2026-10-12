import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Business,
  Category,
  CustomerReview,
  ModerationAction,
  BusinessReport,
  AuditEvent,
  ReminderLog,
  ReferralRecord,
  SystemIntegrations,
  UserAccount,
} from '../types/pipsqueak.ts';
import { matchBusinessSmartSearch } from '../utils/smartSearch.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'pipsqueak_db.json');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'seeker_db.json');

export interface PipSqueakDatabase {
  categories: Category[];
  businesses: Business[];
  reviews: CustomerReview[];
  users: UserAccount[];
  moderationActions: ModerationAction[];
  reports: BusinessReport[];
  auditEvents: AuditEvent[];
  reminders: ReminderLog[];
  referrals?: ReferralRecord[];
  processedPaymentEvents?: { eventId: string; businessId: string; amount: number; timestamp: string }[];
  systemSettings: {
    initialSignUpFee: number; // 19.99
    renewalFee: number; // 25
    quarterlyFee?: number; // legacy alias (25)
    termMonths: number; // 2
    optionalAppFeeEnabled: boolean; // false
    optionalAppFee: number; // 1
  };
}

// URL safety validation (HTTP/HTTPS only; reject javascript:, data:, file:)
export function validateSafeUrl(url?: string): boolean {
  if (!url || !url.trim()) return true;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return false;
  }
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

// Strict public business view projection: strips private owner/billing/admin fields
// and protects home-based / service-area business street addresses
export function getPublicBusinessProjection(b: Business) {
  const isPrivateAddress = b.isServiceAreaOnly || b.locationType === 'service_area' || b.locationType === 'online_only';
  const showStreetAddress = Boolean(b.publishStreetAddress && !b.isServiceAreaOnly);

  return {
    id: b.id,
    name: b.name,
    entityType: b.entityType,
    shortDescription: b.shortDescription,
    category: b.category,
    customCategory: b.customCategory,
    customSubcategory: b.customSubcategory,
    subcategory: b.subcategory,
    keywords: b.keywords,
    address: isPrivateAddress && !showStreetAddress ? '' : b.address,
    city: b.city,
    state: b.state,
    zipCode: b.zipCode,
    serviceArea: b.serviceArea,
    isServiceAreaOnly: b.isServiceAreaOnly,
    locationType: b.locationType || (b.isServiceAreaOnly ? 'service_area' : 'storefront'),
    publishStreetAddress: b.publishStreetAddress,
    phone: b.phone,
    email: b.email,
    website: b.website,
    orderOnlineUrl: b.orderOnlineUrl,
    bookingUrl: b.bookingUrl,
    directionsUrl: isPrivateAddress && !showStreetAddress ? undefined : b.directionsUrl,
    logoUrl: b.logoUrl,
    photos: b.photos || [],
    menuPhotos: b.menuPhotos || [],
    menuFileUrl: b.menuFileUrl,
    menuItems: b.menuItems || [],
    services: b.services || [],
    hours: b.hours,
    status: b.status,
    averageRating: b.averageRating,
    ratingCount: b.ratingCount,
    flyer: b.flyer?.status === 'published' ? b.flyer : undefined,
  };
}

// Generate permanent non-sequential business ID
export function generateBusinessId(): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let result = 'sk-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const defaultCategories: Category[] = [
  {
    id: 'restaurants-food',
    name: 'Restaurants / Food',
    description: 'Local eateries, artisan bistros, bakeries, cafes, and diners.',
    subcategories: ['Scratch Kitchen', 'Artisan Bakery', 'Café & Espresso', 'Diner & Comfort Food', 'Pizzeria', 'Food Truck'],
    suggestedKeywords: [
      'cuisine type',
      'fresh pasta',
      'wood-fired pizza',
      'farm-to-table',
      'espresso',
      'craft cocktails',
      'takeout',
      'bakery',
      'soul food',
      'custom cakes',
    ],
    requiresMenu: true,
  },
  {
    id: 'automotive',
    name: 'Automotive',
    description: 'Certified repair bays, diagnostics, tire replacement, and detailing.',
    subcategories: ['General Mechanical Repair', 'Brake & Tire Service', 'Oil & Lube Maintenance', 'Mobile Mechanic', 'Auto Detailing', 'Transmission & Engine'],
    suggestedKeywords: [
      'mechanic',
      'mobile mechanic',
      'oil change',
      'tire service',
      'tire repair',
      'detailing',
      'brake repair',
      'transmission',
      'diagnostics',
      'wheel alignment',
    ],
    requiresMenu: false,
  },
  {
    id: 'home-services',
    name: 'Home Repair / Home Services',
    description: 'Licensed contracting, painting, plumbing, carpentry, and handyman repairs.',
    subcategories: ['Handyman Services', 'Interior & Exterior Painting', 'Residential Plumbing', 'Finish Carpentry', 'Electrical Repairs', 'Appliance Installation'],
    suggestedKeywords: [
      'painting',
      'appliance installation',
      'handyman',
      'home repairs',
      'carpentry',
      'plumbing',
      'electrical',
      'drywall',
      'pressure washing',
      'gutter cleaning',
    ],
    requiresMenu: false,
  },
  {
    id: 'pet-services',
    name: 'Pet Services',
    description: 'Professional dog grooming, pet sitting, walking, and wellness care.',
    subcategories: ['Dog Walking', 'Pet Grooming', 'In-Home Pet Sitting', 'Dog Boarding & Daycare', 'Puppy Training', 'Mobile Pet Spa'],
    suggestedKeywords: [
      'dog walking',
      'pet grooming',
      'pet sitting',
      'cat sitting',
      'puppy training',
      'pet boarding',
      'flea baths',
      'nail trimming',
      'mobile grooming',
    ],
    requiresMenu: false,
  },
  {
    id: 'beauty-barber-salon',
    name: 'Beauty / Barber / Salon',
    description: 'Independent barber shops, hair stylists, nail studios, and estheticians.',
    subcategories: ['Barber Shop', 'Hair Salon', 'Braiding & Natural Hair', 'Nail Studio', 'Esthetics & Facials', 'Lash & Brow'],
    suggestedKeywords: ['barber', 'haircut', 'braiding', 'fade', 'balayage', 'manicure', 'facial', 'lashes', 'skincare'],
    requiresMenu: false,
  },
  {
    id: 'cleaning-services',
    name: 'Cleaning Services',
    description: 'Residential home cleaning, deep cleaning, move-out cleans, and commercial janitorial.',
    subcategories: ['Residential Home Cleaning', 'Deep Clean & Move-Out', 'Commercial Janitorial', 'Carpet & Upholstery', 'Window Washing'],
    suggestedKeywords: ['house cleaning', 'deep clean', 'maid service', 'move out cleaning', 'carpet cleaning', 'window washing', 'eco cleaning'],
    requiresMenu: false,
  },
  {
    id: 'childcare',
    name: 'Childcare',
    description: 'Licensed home daycares, after-school care, preschools, and trusted family babysitters.',
    subcategories: ['Licensed Family Daycare', 'In-Home Childcare', 'After-School Program', 'Babysitting & Nanny', 'Preschool'],
    suggestedKeywords: ['childcare', 'daycare', 'infant care', 'toddler care', 'after school', 'nanny', 'babysitter', 'early learning'],
    requiresMenu: false,
  },
  {
    id: 'senior-services',
    name: 'Senior Services',
    description: 'Non-medical companion care, senior errand assistance, and home accessibility support.',
    subcategories: ['Companion Care', 'Senior Transportation', 'Errand & Meal Support', 'Home Safety Modifications', 'Respite Care'],
    suggestedKeywords: ['senior care', 'companion', 'elderly assistance', 'errand helper', 'respite care', 'senior transport'],
    requiresMenu: false,
  },
  {
    id: 'landscaping-lawn-care',
    name: 'Landscaping / Lawn Care',
    description: 'Yard maintenance, mowing, seasonal cleanups, hedge trimming, and garden design.',
    subcategories: ['Lawn Mowing & Edging', 'Seasonal Yard Cleanup', 'Hedge & Shrub Trimming', 'Garden Bed Maintenance', 'Irrigation & Drainage'],
    suggestedKeywords: ['lawn care', 'lawn mowing', 'landscaping', 'yard cleanup', 'hedge trimming', 'aeration', 'mulching', 'leaf removal'],
    requiresMenu: false,
  },
  {
    id: 'moving-services',
    name: 'Moving Services',
    description: 'Local neighborhood moving crews, furniture delivery, and packing assistance.',
    subcategories: ['Local Residential Moving', 'Furniture Delivery', 'Loading & Unloading', 'Packing & Supplies', 'Junk Removal & Hauling'],
    suggestedKeywords: ['movers', 'local moving', 'moving truck', 'furniture delivery', 'junk removal', 'hauling', 'packing help'],
    requiresMenu: false,
  },
  {
    id: 'transportation',
    name: 'Transportation',
    description: 'Airport shuttles, private drivers, non-emergency transport, and group charters.',
    subcategories: ['Airport Shuttle', 'Private Chauffeur', 'Courier Transport', 'Senior Transportation', 'Charter Van'],
    suggestedKeywords: ['airport ride', 'private driver', 'shuttle service', 'transportation', 'chauffeur', 'car service'],
    requiresMenu: false,
  },
  {
    id: 'photography-video',
    name: 'Photography / Video',
    description: 'Portrait photography, event videography, family sessions, and commercial branding shoots.',
    subcategories: ['Family & Portrait', 'Weddings & Celebrations', 'Commercial & Product', 'Real Estate Photography', 'Drone & Aerial Video'],
    suggestedKeywords: ['photographer', 'family photos', 'headshots', 'wedding photographer', 'videography', 'drone photo', 'portraits'],
    requiresMenu: false,
  },
  {
    id: 'event-services',
    name: 'Event Services',
    description: 'Party rentals, DJs, floral styling, event coordinators, and celebration decor.',
    subcategories: ['Party Rentals & Tents', 'DJ & Audio Engineering', 'Floral Styling', 'Event Planning & Coordination', 'Balloon & Backdrop Decor'],
    suggestedKeywords: ['event planner', 'dj', 'party rentals', 'florist', 'event lighting', 'photo booth', 'decorations'],
    requiresMenu: false,
  },
  {
    id: 'catering',
    name: 'Catering',
    description: 'Artisan off-site catering, private chefs, buffet trays, and celebration cuisine.',
    subcategories: ['Corporate Catering', 'Private Dinner Chef', 'Wedding & Event Catering', 'Party Trays & Platters', 'Mobile Food Cart'],
    suggestedKeywords: ['catering', 'private chef', 'party platters', 'corporate lunch', 'event catering', 'barbecue catering', 'appetizers'],
    requiresMenu: true,
  },
  {
    id: 'clothing-fashion',
    name: 'Clothing / Fashion',
    description: 'Independent boutiques, tailoring & alterations, custom embroidery, and vintage apparel.',
    subcategories: ['Boutique Clothing', 'Tailoring & Alterations', 'Custom Apparel & Printing', 'Vintage & Consignment', 'Handmade Knitwear'],
    suggestedKeywords: ['boutique', 'alterations', 'tailor', 'custom t-shirts', 'vintage clothing', 'embroidery', 'fashion design'],
    requiresMenu: false,
  },
  {
    id: 'retail-specialty-shops',
    name: 'Retail / Specialty Shops',
    description: 'Neighborhood brick-and-mortar storefronts, independent bookshops, gifts, and specialty goods.',
    subcategories: ['Books & Stationery', 'Gifts & Home Goods', 'Specialty Grocery', 'Plants & Nursery', 'Craft & Hobby Supplies'],
    suggestedKeywords: ['local shop', 'gifts', 'bookstore', 'plants', 'artisan goods', 'specialty foods', 'boutique retail'],
    requiresMenu: false,
  },
  {
    id: 'professional-services',
    name: 'Professional Services',
    description: 'Notary publics, legal document preparation, translation, architecture, and business operations.',
    subcategories: ['Mobile Notary Public', 'Document Preparation', 'Translation & Interpretation', 'Drafting & Architecture', 'Human Resources'],
    suggestedKeywords: ['notary', 'mobile notary', 'document prep', 'translator', 'certified translation', 'drafting', 'compliance'],
    requiresMenu: false,
  },
  {
    id: 'tax-bookkeeping',
    name: 'Tax / Bookkeeping',
    description: 'Individual tax preparation, small business bookkeeping, payroll, and financial filings.',
    subcategories: ['Individual Tax Return', 'Small Business Bookkeeping', 'Payroll Management', 'QuickBooks Specialist', 'IRS Audit Support'],
    suggestedKeywords: ['tax preparation', 'bookkeeping', 'accountant', 'payroll', 'small business taxes', 'quickbooks', 'tax filing'],
    requiresMenu: false,
  },
  {
    id: 'consulting',
    name: 'Consulting',
    description: 'Strategic advisory, marketing consultants, workflow automation, and career advisors.',
    subcategories: ['Small Business Advisory', 'Marketing & Social Media', 'IT & Systems Strategy', 'Career Coaching', 'Operations Consulting'],
    suggestedKeywords: ['consultant', 'business coach', 'marketing strategy', 'social media', 'workflow', 'operations advisor'],
    requiresMenu: false,
  },
  {
    id: 'technology-computer-repair',
    name: 'Technology / Computer Repair',
    description: 'Computer diagnostics, laptop screen replacement, smartphone repair, and home Wi-Fi setup.',
    subcategories: ['PC & Mac Diagnostics', 'Screen & Battery Repair', 'Data Recovery', 'Home & Office Wi-Fi Setup', 'Custom PC Building'],
    suggestedKeywords: ['computer repair', 'phone repair', 'mac repair', 'data recovery', 'wifi setup', 'laptop screen', 'virus removal'],
    requiresMenu: false,
  },
  {
    id: 'mobile-services',
    name: 'Mobile Services',
    description: 'On-demand mobile services that travel directly to client homes and workplaces.',
    subcategories: ['Mobile Detailing', 'Mobile Locksmith', 'Mobile Notary', 'Mobile Knife Sharpening', 'Mobile Tire Installation'],
    suggestedKeywords: ['mobile service', 'we come to you', 'mobile mechanic', 'mobile locksmith', 'mobile detailing', 'on site service'],
    requiresMenu: false,
  },
  {
    id: 'fitness-personal-training',
    name: 'Fitness / Personal Training',
    description: 'Certified personal trainers, yoga instructors, martial arts, and boutique fitness studios.',
    subcategories: ['One-on-One Personal Training', 'Yoga & Pilates', 'Martial Arts & Self-Defense', 'Strength Conditioning', 'Outdoor Bootcamps'],
    suggestedKeywords: ['personal trainer', 'fitness coach', 'yoga', 'pilates', 'strength training', 'workout', 'boxing'],
    requiresMenu: false,
  },
  {
    id: 'tutoring-education',
    name: 'Tutoring / Education',
    description: 'K-12 academic tutors, test prep mentors, private music instructors, and language tutors.',
    subcategories: ['K-12 Math & Science', 'Music Lessons (Piano, Guitar)', 'Language Instruction', 'SAT/ACT Test Prep', 'Reading & Writing Coach'],
    suggestedKeywords: ['tutoring', 'math tutor', 'piano lessons', 'guitar lessons', 'spanish lessons', 'test prep', 'reading coach'],
    requiresMenu: false,
  },
  {
    id: 'arts-crafts',
    name: 'Arts / Crafts',
    description: 'Local artisans, custom ceramicists, woodturners, custom framers, and stained glass craftspeople.',
    subcategories: ['Ceramics & Pottery', 'Custom Framing', 'Woodworking & Furniture', 'Stained Glass', 'Printmaking & Letterpress'],
    suggestedKeywords: ['custom framing', 'pottery', 'woodworking', 'handmade gifts', 'ceramics', 'artisan craft', 'custom decor'],
    requiresMenu: false,
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    description: 'Acoustic musicians, magicians, party characters, balloon artists, and live event performers.',
    subcategories: ['Live Acoustic Music', 'Party Entertainers & Characters', 'Magic & Illusions', 'Trivia & Game Hosts', 'Stand-Up & Emcees'],
    suggestedKeywords: ['live music', 'acoustic performer', 'magician', 'party entertainment', 'kids party host', 'emcee'],
    requiresMenu: false,
  },
  {
    id: 'personal-services',
    name: 'Personal Services',
    description: 'Personal organizers, closet concierges, personal shoppers, and life transition helpers.',
    subcategories: ['Home & Closet Organizing', 'Personal Shopping', 'Moving Concierge', 'Life Transition Helper', 'Wardrobe Stylist'],
    suggestedKeywords: ['home organizer', 'decluttering', 'personal assistant', 'closet organization', 'personal stylist'],
    requiresMenu: false,
  },
  {
    id: 'delivery-courier',
    name: 'Delivery / Courier',
    description: 'Local document couriers, fragile package delivery, legal process service, and same-day errands.',
    subcategories: ['Same-Day Local Courier', 'Legal Document Delivery', 'Fragile Item Transport', 'Specialty Floral Delivery', 'Medical Courier'],
    suggestedKeywords: ['courier', 'delivery service', 'same day delivery', 'document courier', 'local messenger', 'errand delivery'],
    requiresMenu: false,
  },
  {
    id: 'construction-trades',
    name: 'Construction / Trades',
    description: 'Specialty trade contractors including roofing, masonry, HVAC, electrical, and concrete.',
    subcategories: ['Roofing & Gutters', 'HVAC & Heat Pumps', 'Masonry & Concrete', 'Fencing & Decks', 'Welding & Metal Fabrication'],
    suggestedKeywords: ['roofing', 'hvac', 'furnace repair', 'heat pump', 'concrete', 'fencing', 'deck builder', 'masonry'],
    requiresMenu: false,
  },
  {
    id: 'real-estate-services',
    name: 'Real Estate Services',
    description: 'Independent real estate brokers, home inspectors, appraisal specialists, and property managers.',
    subcategories: ['Home Inspection', 'Property Management', 'Residential Brokerage', 'Real Estate Appraisal', 'Staging Services'],
    suggestedKeywords: ['home inspector', 'property manager', 'realtor', 'home staging', 'inspection report', 'rental management'],
    requiresMenu: false,
  },
  {
    id: 'home-based-businesses',
    name: 'Home-Based Businesses',
    description: 'Licensed cottage kitchen bakers, artisan home makers, candle ateliers, and custom crafters.',
    subcategories: ['Cottage Bakery & Confections', 'Artisan Candles & Scents', 'Handmade Bath & Body', 'Custom Embroidery', 'Virtual Bookkeeper'],
    suggestedKeywords: ['cottage baker', 'custom cakes', 'artisan candles', 'handmade soap', 'home business', 'custom gifts'],
    requiresMenu: false,
  },
  {
    id: 'online-businesses',
    name: 'Online Businesses',
    description: 'Locally rooted e-commerce shops, digital agencies, web developers, and remote creators.',
    subcategories: ['Local E-Commerce', 'Website Design & Development', 'Digital Marketing & SEO', 'Content & Copywriting', 'Graphic Design'],
    suggestedKeywords: ['web design', 'online store', 'ecommerce', 'seo', 'graphic design', 'digital creator', 'branding'],
    requiresMenu: false,
  },
  {
    id: 'other',
    name: 'Other / Not Listed',
    description: 'Custom, specialized, or unique independent small businesses not listed in standard categories.',
    subcategories: ['Custom Independent Enterprise', 'Specialty Craft', 'Unique Service Provider'],
    suggestedKeywords: ['specialty service', 'independent business', 'local specialist', 'custom services', 'artisan'],
    requiresMenu: false,
    isCustom: true,
  },
];

const defaultUsers: UserAccount[] = [
  {
    id: 'user-owner-1',
    email: 'contrabandbam@gmail.com',
    name: 'Marcus Vance',
    role: 'owner',
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    id: 'user-admin-1',
    email: 'admin@pipsqueak.local',
    name: 'PipSqueak Administrator',
    role: 'admin',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'user-staff-1',
    email: 'sarah.staff@bistro.local',
    name: 'Sarah Chen (Staff)',
    role: 'staff',
    createdAt: '2026-02-15T14:30:00Z',
  },
];

const now = new Date();
const twoMonthsFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
// Reminder scheduled: 15-30 days before expiration
const reminderDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

const defaultBusinesses: Business[] = [
  {
    id: 'sk-8a1f49b2',
    ownerId: 'user-owner-1',
    ownerEmail: 'contrabandbam@gmail.com',
    name: 'Laurel & Olive Osteria',
    shortDescription: 'Seasonal Mediterranean scratch kitchen celebrating wood-fired sourdough, handmade pastas, and regional olive oils.',
    category: 'restaurants-food',
    keywords: ['cuisine type', 'fresh pasta', 'wood-fired pizza', 'farm-to-table', 'catering'],
    address: '428 Mill Creek Way',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98101',
    serviceArea: 'Downtown, Capitol Hill, Queen Anne',
    phone: '(206) 555-0142',
    email: 'hello@laurelandolive.local',
    website: 'https://laurelandolive.local',
    directionsUrl: 'https://maps.google.com/?q=428+Mill+Creek+Way+Seattle+WA',
    photos: ['/src/assets/images/seeker_restaurant_bistro_1791171557687.jpg'],
    menuPhotos: ['/src/assets/images/seeker_restaurant_menu_1791171631325.jpg'],
    menuItems: [
      { id: 'm1', name: 'Hand-Rolled Tagliatelle Tartufata', description: 'Cultured butter, cracked black peppercorn, shaved summer truffle', price: '$26.00', category: 'Handmade Pasta' },
      { id: 'm2', name: 'Wood-Fired Margherita D.O.P.', description: 'San Marzano tomatoes, fior di latte, fresh basil, cold-pressed olive oil', price: '$19.00', category: 'Wood Fired' },
      { id: 'm3', name: 'Crispy Artichoke Fritti', description: 'Meyer lemon aioli, mint, toasted sea salt', price: '$14.00', category: 'Starters' },
      { id: 'm4', name: 'Olive Oil Citrus Polenta Cake', description: 'Whipped mascarpone, rosemary berry reduction', price: '$11.00', category: 'Dessert' }
    ],
    services: [
      { id: 's1', name: 'Private Dining & Celebrations', description: 'Mezzanine dining room accommodating up to 28 guests', price: 'Inquire for quote' },
      { id: 's2', name: 'Off-Site Artisan Catering', description: 'Wood-fired mobile oven setup for private estate gatherings', price: 'Custom package' }
    ],
    hours: {
      monday: 'Closed',
      tuesday: '4:00 PM – 10:00 PM',
      wednesday: '4:00 PM – 10:00 PM',
      thursday: '4:00 PM – 10:00 PM',
      friday: '4:00 PM – 11:00 PM',
      saturday: '11:00 AM – 11:00 PM',
      sunday: '11:00 AM – 9:00 PM',
    },
    status: 'active',
    staff: [
      {
        id: 'st-1',
        userId: 'user-staff-1',
        email: 'sarah.staff@bistro.local',
        name: 'Sarah Chen',
        permissions: ['edit_profile', 'edit_menu', 'edit_photos'],
        invitedAt: '2026-02-15T14:30:00Z',
      }
    ],
    billing: {
      status: 'paid',
      isInitialSignUpPaid: true,
      initialSignUpFee: 19.99,
      renewalFee: 25,
      quarterlyFee: 25,
      termMonths: 2,
      termStartDate: now.toISOString(),
      paidThroughDate: twoMonthsFromNow,
      expirationDate: twoMonthsFromNow,
      reminderScheduledDate: reminderDate,
      reminderSent: false,
      providerReference: 'ch_sim_3n78k94Lp0Qx',
      receiptNumber: 'REC-2026-0042',
      lastPaymentVerifiedAt: now.toISOString(),
      referralCode: 'REF-8A1F49B2',
      referralsCount: 0,
    },
    flyer: {
      id: 'fl-laurel-1',
      businessId: 'sk-8a1f49b2',
      headline: 'Complimentary Antipasto with Two Entrees',
      offerDetails: 'Present this PipSqueak profile card during dinner service Tuesday through Thursday. Valid through this month.',
      photoUrl: '/src/assets/images/seeker_restaurant_bistro_1791171557687.jpg',
      accentColor: '#16a34a',
      template: 'modern',
      status: 'published',
      updatedAt: '2026-02-10T12:00:00Z',
    },
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: now.toISOString(),
  },
  {
    id: 'sk-5d9c22e4',
    ownerId: 'user-owner-1',
    ownerEmail: 'contrabandbam@gmail.com',
    name: 'Precision Apex Auto Works',
    shortDescription: 'Full-service diagnostic and mechanical repair facility specializing in domestic & European vehicles, brakes, and diagnostics.',
    category: 'automotive',
    keywords: ['mechanic', 'oil change', 'brake repair', 'tire service', 'diagnostics'],
    address: '1108 Industrial Parkway Suite B',
    city: 'Bellevue',
    state: 'WA',
    zipCode: '98004',
    serviceArea: 'Bellevue, Redmond, Kirkland, Issaquah',
    phone: '(425) 555-0899',
    email: 'service@precisionapex.local',
    website: 'https://precisionapex.local',
    directionsUrl: 'https://maps.google.com/?q=1108+Industrial+Parkway+Bellevue+WA',
    photos: ['/src/assets/images/seeker_automotive_garage_1791171572958.jpg'],
    menuPhotos: [],
    menuItems: [],
    services: [
      { id: 'as1', name: 'Comprehensive 60-Point Safety & Computer Diagnostic', description: 'Full OBD-II sensor sweep, battery, alternator, fluid health', price: '$89.00' },
      { id: 'as2', name: 'Synthetic Oil & Filter Service', description: 'Up to 5 quarts OEM spec synthetic oil, new filter, chassis lube', price: '$79.95' },
      { id: 'as3', name: 'Ceramic Brake Pad & Rotor Replacement', description: 'Front or rear axle, hardware replacement, caliper lubrication', price: '$285.00' },
      { id: 'as4', name: 'Four-Wheel Precision Laser Alignment', description: 'Restore factory geometry to prevent tire wear', price: '$120.00' }
    ],
    hours: {
      monday: '7:30 AM – 6:00 PM',
      tuesday: '7:30 AM – 6:00 PM',
      wednesday: '7:30 AM – 6:00 PM',
      thursday: '7:30 AM – 6:00 PM',
      friday: '7:30 AM – 6:00 PM',
      saturday: '8:00 AM – 2:00 PM',
      sunday: 'Closed',
    },
    status: 'active',
    staff: [],
    billing: {
      status: 'paid',
      isInitialSignUpPaid: true,
      initialSignUpFee: 19.99,
      renewalFee: 25,
      quarterlyFee: 25,
      termMonths: 2,
      termStartDate: now.toISOString(),
      paidThroughDate: twoMonthsFromNow,
      expirationDate: twoMonthsFromNow,
      reminderScheduledDate: reminderDate,
      reminderSent: false,
      providerReference: 'ch_sim_9k2m88vBt4Nx',
      receiptNumber: 'REC-2026-0043',
      lastPaymentVerifiedAt: now.toISOString(),
      referralCode: 'REF-5D9C22E4',
      referralsCount: 0,
    },
    flyer: {
      id: 'fl-apex-1',
      businessId: 'sk-5d9c22e4',
      headline: '$25 Off Seasonal Brake & Fluid Package',
      offerDetails: 'Show this digital PipSqueak listing flyer when dropping off your vehicle. One per customer.',
      photoUrl: '/src/assets/images/seeker_automotive_garage_1791171572958.jpg',
      accentColor: '#2563eb',
      template: 'bold',
      status: 'published',
      updatedAt: '2026-02-12T09:00:00Z',
    },
    createdAt: '2026-01-15T11:00:00Z',
    updatedAt: now.toISOString(),
  },
  {
    id: 'sk-3f7b88a0',
    ownerId: 'user-owner-2',
    ownerEmail: 'craftsman@heritagehomes.local',
    name: 'Timber & Stone Home Craftsmen',
    shortDescription: 'Licensed general contracting, architectural carpentry, interior painting, and reliable residential repairs.',
    category: 'home-services',
    keywords: ['painting', 'handyman', 'home repairs', 'carpentry', 'appliance installation'],
    address: '7302 Greenwood Ave N',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98103',
    serviceArea: 'Greater Seattle, Shoreline, Edmonds',
    phone: '(206) 555-0371',
    email: 'estimates@timberandstone.local',
    website: 'https://timberandstone.local',
    photos: ['/src/assets/images/seeker_home_craftsman_1791171582249.jpg'],
    menuPhotos: [],
    menuItems: [],
    services: [
      { id: 'hs1', name: 'Interior & Exterior Premium Painting', description: 'Wall repair, priming, two-coat low VOC finish', price: 'Free on-site estimate' },
      { id: 'hs2', name: 'Finish Carpentry & Built-in Shelving', description: 'Custom crown molding, baseboards, wainscoting', price: '$85 / hr' },
      { id: 'hs3', name: 'Residential Handyman Maintenance', description: 'Door alignment, fixtures, drywall patch, appliance hookup', price: '$75 / hr' }
    ],
    hours: {
      monday: '8:00 AM – 5:00 PM',
      tuesday: '8:00 AM – 5:00 PM',
      wednesday: '8:00 AM – 5:00 PM',
      thursday: '8:00 AM – 5:00 PM',
      friday: '8:00 AM – 5:00 PM',
      saturday: 'By appointment',
      sunday: 'Closed',
    },
    status: 'active',
    staff: [],
    billing: {
      status: 'paid',
      isInitialSignUpPaid: true,
      initialSignUpFee: 19.99,
      renewalFee: 25,
      quarterlyFee: 25,
      termMonths: 2,
      termStartDate: now.toISOString(),
      paidThroughDate: twoMonthsFromNow,
      expirationDate: twoMonthsFromNow,
      reminderScheduledDate: reminderDate,
      reminderSent: false,
      providerReference: 'ch_sim_119f44yZt8Rq',
      receiptNumber: 'REC-2026-0044',
      lastPaymentVerifiedAt: now.toISOString(),
      referralCode: 'REF-3F7B88A0',
      referralsCount: 0,
    },
    createdAt: '2026-01-20T14:00:00Z',
    updatedAt: now.toISOString(),
  },
  {
    id: 'sk-9e4a77d1',
    ownerId: 'user-owner-3',
    ownerEmail: 'bark@pawsandwhiskers.local',
    name: 'Paws & Whiskers Grooming Studio',
    shortDescription: 'Gentle, fear-free full-coat styling, soothing warm-water hydrobaths, and caring neighborhood dog walking.',
    category: 'pet-services',
    keywords: ['pet grooming', 'dog walking', 'pet sitting', 'flea baths', 'nail trimming'],
    address: '512 Northgate Way',
    city: 'Seattle',
    state: 'WA',
    zipCode: '98125',
    serviceArea: 'Northgate, Maple Leaf, Wedgwood, Ballard',
    phone: '(206) 555-0922',
    email: 'care@pawsandwhiskers.local',
    website: 'https://pawsandwhiskers.local',
    photos: ['/src/assets/images/seeker_pet_grooming_1791171590899.jpg'],
    menuPhotos: [],
    menuItems: [],
    services: [
      { id: 'ps1', name: 'Signature Hydrobath Spa & Coat Deshed', description: 'Hypoallergenic shampoo, blueberry facial, ear clean, blow dry', price: '$65.00' },
      { id: 'ps2', name: 'Full Breed-Standard Haircut & Style', description: 'Sanitary trim, pad shave, full hand-scissor styling', price: '$85.00' },
      { id: 'ps3', name: '30-Minute Neighborhood Dog Walking', description: 'GPS-tracked solitary or buddy walk with photo check-in', price: '$28.00' },
      { id: 'ps4', name: 'Pedicure & Ultrasonic Teeth Polish', description: 'Nail trim & grind with plaque prevention polish', price: '$22.00' }
    ],
    hours: {
      monday: '8:30 AM – 5:30 PM',
      tuesday: '8:30 AM – 5:30 PM',
      wednesday: '8:30 AM – 5:30 PM',
      thursday: '8:30 AM – 5:30 PM',
      friday: '8:30 AM – 5:30 PM',
      saturday: '9:00 AM – 4:00 PM',
      sunday: 'Closed',
    },
    status: 'active',
    staff: [],
    billing: {
      status: 'paid',
      isInitialSignUpPaid: true,
      initialSignUpFee: 19.99,
      renewalFee: 25,
      quarterlyFee: 25,
      termMonths: 2,
      termStartDate: now.toISOString(),
      paidThroughDate: twoMonthsFromNow,
      expirationDate: twoMonthsFromNow,
      reminderScheduledDate: reminderDate,
      reminderSent: false,
      providerReference: 'ch_sim_66a988tRe3Wz',
      receiptNumber: 'REC-2026-0045',
      lastPaymentVerifiedAt: now.toISOString(),
      referralCode: 'REF-9E4A77D1',
      referralsCount: 0,
    },
    createdAt: '2026-02-01T09:00:00Z',
    updatedAt: now.toISOString(),
  }
];

const defaultReviews: CustomerReview[] = [
  {
    id: 'rev-sample-1',
    businessId: 'sk-8a1f49b2',
    reviewerName: 'Elena R.',
    rating: 5,
    comment: 'The handmade pasta and burrata were extraordinary! Attentive service, warm ambience, and wonderful seasonal appetizers.',
    createdAt: '2026-02-15T18:30:00Z',
    status: 'published',
    flaggedByOwner: false,
  },
  {
    id: 'rev-sample-2',
    businessId: 'sk-8a1f49b2',
    reviewerName: 'Marcus P.',
    rating: 4,
    comment: 'Lovely romantic patio and crisp wood-fired pizza crust. Great wine pairings recommended by the staff.',
    createdAt: '2026-03-02T19:45:00Z',
    status: 'published',
    flaggedByOwner: false,
  },
  {
    id: 'rev-sample-3',
    businessId: 'sk-5d9c22e4',
    reviewerName: 'David K.',
    rating: 5,
    comment: 'Honest diagnostics and fast brake pad replacement. Gave a clear estimate before turning a single bolt. Will return!',
    createdAt: '2026-02-20T14:15:00Z',
    status: 'published',
    flaggedByOwner: false,
  },
  {
    id: 'rev-sample-4',
    businessId: 'sk-3f7b88a0',
    reviewerName: 'Claire T.',
    rating: 5,
    comment: 'Custom timber shelving exceeded our expectations. Flawless joinery, clean work area, and completed exactly on schedule.',
    createdAt: '2026-01-28T11:00:00Z',
    status: 'published',
    flaggedByOwner: false,
  },
];

class PipSqueakDB {
  private data: PipSqueakDatabase;

  constructor() {
    this.ensureDataDir();
    this.data = this.loadData();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadData(): PipSqueakDatabase {
    try {
      const activeFile = fs.existsSync(DB_FILE) ? DB_FILE : fs.existsSync(LEGACY_DB_FILE) ? LEGACY_DB_FILE : null;
      if (activeFile) {
        const raw = fs.readFileSync(activeFile, 'utf-8');
        const parsed: PipSqueakDatabase = JSON.parse(raw);
        if (parsed && parsed.businesses) {
          // Normalize existing records to Short Stack v2.4 structure ($19.99 enrollment, $25 every 2 months)
          parsed.businesses.forEach((b) => {
            if (!b.billing.initialSignUpFee || b.billing.initialSignUpFee === 50) {
              b.billing.isInitialSignUpPaid = b.billing.status === 'paid';
              b.billing.initialSignUpFee = 19.99;
              b.billing.renewalFee = b.billing.hasReferralDiscount ? 12.50 : 25;
              b.billing.quarterlyFee = b.billing.renewalFee;
              b.billing.termMonths = 2;
            }
            if (!b.billing.referralCode) {
              b.billing.referralCode = `REF-${b.id.replace('sk-', '').toUpperCase()}`;
            }
            if (!b.referralCode) {
              b.referralCode = b.billing.referralCode;
            }
          });
          parsed.systemSettings.initialSignUpFee = 19.99;
          parsed.systemSettings.renewalFee = 25;
          parsed.systemSettings.quarterlyFee = 25;
          parsed.systemSettings.termMonths = 2;
          parsed.systemSettings.optionalAppFeeEnabled = false;
          parsed.systemSettings.optionalAppFee = 1;
          if (!parsed.referrals) {
            parsed.referrals = [];
          }
          if (!parsed.reviews || parsed.reviews.length === 0) {
            parsed.reviews = defaultReviews;
          }
          if (!parsed.categories || parsed.categories.length === 0) {
            parsed.categories = [...defaultCategories];
          } else {
            // Merge in default categories so expanded categories are available immediately
            const existingCatIds = new Set(parsed.categories.map((c) => c.id));
            for (const dc of defaultCategories) {
              if (!existingCatIds.has(dc.id)) {
                parsed.categories.push(dc);
              }
            }
          }
          // Compute automatic ratings for all businesses from published reviews
          parsed.businesses.forEach((b) => {
            const pub = parsed.reviews.filter((r) => r.businessId === b.id && r.status === 'published');
            if (pub.length === 0) {
              b.averageRating = null;
              b.ratingCount = 0;
            } else {
              const sum = pub.reduce((acc, r) => acc + r.rating, 0);
              b.averageRating = Math.round((sum / pub.length) * 10) / 10;
              b.ratingCount = pub.length;
            }
          });
          // Ensure saved to current pipsqueak_db.json
          this.saveData(parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error reading database file, re-initializing defaults', e);
    }

    const initialData: PipSqueakDatabase = {
      categories: defaultCategories,
      businesses: defaultBusinesses,
      reviews: defaultReviews,
      users: defaultUsers,
      moderationActions: [
        {
          id: 'mod-1',
          businessId: 'sk-8a1f49b2',
          businessName: 'Laurel & Olive Osteria',
          previousStatus: 'pending_payment',
          newStatus: 'active',
          reason: 'Initial publication verified with menu photo and $19.99 initial enrollment fee paid.',
          actor: 'System / Stripe Webhook',
          timestamp: '2026-01-10T10:05:00Z',
        }
      ],
      reports: [],
      auditEvents: [
        {
          id: 'aud-1',
          timestamp: '2026-01-10T10:05:00Z',
          actor: 'user-owner-1',
          action: 'initial_signup_payment_verified',
          targetId: 'sk-8a1f49b2',
          details: 'Paid $19.99 initial sign-up fee for 2-month advertising term. Expiration set to 2 months.',
        }
      ],
      reminders: [],
      referrals: [],
      systemSettings: {
        initialSignUpFee: 19.99,
        renewalFee: 25,
        quarterlyFee: 25,
        termMonths: 2,
        optionalAppFeeEnabled: false,
        optionalAppFee: 1,
      },
    };

    this.saveData(initialData);
    return initialData;
  }

  private saveData(data: PipSqueakDatabase) {
    try {
      this.ensureDataDir();
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write pipsqueak_db.json', e);
    }
  }

  public getCategories(includeArchived: boolean = false): Category[] {
    if (includeArchived) {
      return this.data.categories;
    }
    return this.data.categories.filter((c) => !c.isArchived);
  }

  public archiveCategory(id: string, isArchived: boolean): Category | null {
    const cat = this.data.categories.find((c) => c.id === id);
    if (!cat) return null;
    cat.isArchived = isArchived;
    this.saveData(this.data);
    return cat;
  }

  public getCustomCategories(): { customCategory: string; count: number; sampleBusinesses: { id: string; name: string }[] }[] {
    const map = new Map<string, { count: number; sampleBusinesses: { id: string; name: string }[] }>();
    for (const b of this.data.businesses) {
      if (b.customCategory && b.customCategory.trim()) {
        const name = b.customCategory.trim();
        const existing = map.get(name) || { count: 0, sampleBusinesses: [] };
        existing.count += 1;
        if (existing.sampleBusinesses.length < 5) {
          existing.sampleBusinesses.push({ id: b.id, name: b.name });
        }
        map.set(name, existing);
      }
    }
    return Array.from(map.entries()).map(([customCategory, data]) => ({
      customCategory,
      count: data.count,
      sampleBusinesses: data.sampleBusinesses,
    }));
  }

  public promoteCustomCategory(
    customCategoryName: string,
    id: string,
    suggestedKeywords: string[] = [],
    subcategories: string[] = []
  ): Category {
    const newCat: Category = {
      id,
      name: customCategoryName,
      description: `Directory category for verified ${customCategoryName} independent specialists.`,
      suggestedKeywords: suggestedKeywords.length > 0 ? suggestedKeywords : [customCategoryName.toLowerCase()],
      subcategories: subcategories.length > 0 ? subcategories : ['General Services', 'Specialized Services'],
      requiresMenu: false,
      isCustom: false,
      isArchived: false,
    };
    this.updateCategory(newCat);

    // Update existing businesses that used this customCategory to link to the new standard category
    for (const b of this.data.businesses) {
      if (b.customCategory && b.customCategory.toLowerCase().trim() === customCategoryName.toLowerCase().trim()) {
        b.category = id;
      }
    }
    this.saveData(this.data);
    return newCat;
  }

  public updateCategory(category: Category): Category {
    const idx = this.data.categories.findIndex((c) => c.id === category.id);
    if (idx >= 0) {
      this.data.categories[idx] = {
        ...this.data.categories[idx],
        ...category,
      };
    } else {
      this.data.categories.push(category);
    }
    this.saveData(this.data);
    return this.data.categories.find((c) => c.id === category.id) || category;
  }

  public getBusinesses(options?: {
    category?: string;
    keyword?: string;
    location?: string;
    ownerId?: string;
    includeInactive?: boolean;
  }): Business[] {
    let result = [...this.data.businesses];

    // Exclude inactive unless requested by authorized owner or admin
    if (!options?.includeInactive) {
      result = result.filter((b) => b.status === 'active');
    }

    if (options?.ownerId) {
      result = result.filter((b) => b.ownerId === options.ownerId || b.staff?.some((s) => s.userId === options.ownerId));
    }

    if (options?.category && options.category !== 'all') {
      result = result.filter((b) => {
        if (options.category === 'other') {
          return b.category === 'other' || Boolean(b.customCategory);
        }
        return b.category === options.category;
      });
    }

    if (options?.keyword || options?.location) {
      result = result.filter((b) =>
        matchBusinessSmartSearch(b, options?.keyword || '', options?.location || '')
      );
    }

    return result.map((b) => {
      const { averageRating, ratingCount } = this.calculateRatingForBusiness(b.id);
      return {
        ...b,
        averageRating,
        ratingCount,
      };
    });
  }

  public getBusinessById(id: string): Business | undefined {
    const b = this.data.businesses.find((biz) => biz.id === id);
    if (!b) return undefined;
    const { averageRating, ratingCount } = this.calculateRatingForBusiness(b.id);
    return {
      ...b,
      averageRating,
      ratingCount,
    };
  }

  // Calculate average rating and total published rating count automatically
  public calculateRatingForBusiness(businessId: string): { averageRating: number | null; ratingCount: number } {
    const published = (this.data.reviews || []).filter(
      (r) => r.businessId === businessId && r.status === 'published'
    );
    if (published.length === 0) {
      return { averageRating: null, ratingCount: 0 };
    }
    const sum = published.reduce((acc, r) => acc + r.rating, 0);
    const avg = Math.round((sum / published.length) * 10) / 10;
    return { averageRating: avg, ratingCount: published.length };
  }

  // Get reviews (public gets published only, admin/owner gets full list)
  public getReviews(businessId?: string, includeHidden = false): CustomerReview[] {
    let list = this.data.reviews || [];
    if (businessId) {
      list = list.filter((r) => r.businessId === businessId);
    }
    if (!includeHidden) {
      list = list.filter((r) => r.status === 'published');
    }
    // Return newest reviews first
    return list.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Submit customer star rating and optional written review
  public addReview(params: {
    businessId: string;
    reviewerName?: string;
    rating: number;
    comment?: string;
  }): { success: boolean; review?: CustomerReview; averageRating?: number | null; ratingCount?: number; error?: string } {
    const business = this.data.businesses.find((b) => b.id === params.businessId);
    if (!business) {
      return { success: false, error: 'Business listing not found' };
    }

    const rating = Math.round(Number(params.rating));
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be an integer between 1 and 5 stars' };
    }

    // Basic anti-spam, duplicate checks, and privacy safeguards
    const rawName = (params.reviewerName || 'Local Customer').trim().substring(0, 50).replace(/[<>]/g, '');
    const sanitizedName = rawName || 'Local Customer';
    const sanitizedComment = params.comment ? params.comment.trim().substring(0, 1000).replace(/[<>]/g, '') : undefined;

    // Check duplicate: identical non-empty comment for the same business
    if (sanitizedComment) {
      const isDuplicate = (this.data.reviews || []).some(
        (r) => r.businessId === params.businessId && r.comment === sanitizedComment
      );
      if (isDuplicate) {
        return { success: false, error: 'A review with identical feedback has already been submitted.' };
      }
    }

    const review: CustomerReview = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      businessId: params.businessId,
      reviewerName: sanitizedName,
      rating,
      comment: sanitizedComment,
      createdAt: new Date().toISOString(),
      status: 'published',
      flaggedByOwner: false,
    };

    if (!this.data.reviews) {
      this.data.reviews = [];
    }
    this.data.reviews.unshift(review);

    // Recalculate average rating and rating count automatically
    const { averageRating, ratingCount } = this.calculateRatingForBusiness(params.businessId);
    business.averageRating = averageRating;
    business.ratingCount = ratingCount;

    this.saveData(this.data);

    this.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: sanitizedName,
      action: 'customer_review_submitted',
      targetId: params.businessId,
      details: `Submitted ${rating}-star review for "${business.name}". New rating: ${averageRating ?? 'None'} (${ratingCount} total).`,
    });

    return {
      success: true,
      review,
      averageRating,
      ratingCount,
    };
  }

  // Flag review for administrator review (owners CANNOT edit or delete customer reviews)
  public flagReview(reviewId: string, reason: string, actor: string = 'Business Owner'): { success: boolean; error?: string } {
    const rev = (this.data.reviews || []).find((r) => r.id === reviewId);
    if (!rev) {
      return { success: false, error: 'Review not found' };
    }

    rev.flaggedByOwner = actor === 'Business Owner' || rev.flaggedByOwner || false;
    rev.flagReason = reason || `Reported by ${actor} for administrator review`;
    rev.flaggedAt = new Date().toISOString();
    this.saveData(this.data);

    this.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor,
      action: 'review_flagged_for_admin',
      targetId: rev.businessId,
      details: `Review ${reviewId} flagged for moderation by ${actor}: "${rev.flagReason}"`,
    });

    return { success: true };
  }

  // Admin controls to review reported reviews and hide or restore them
  public adminUpdateReviewStatus(
    reviewId: string,
    status: 'published' | 'hidden',
    adminNotes?: string
  ): { success: boolean; review?: CustomerReview; averageRating?: number | null; ratingCount?: number; error?: string } {
    const rev = (this.data.reviews || []).find((r) => r.id === reviewId);
    if (!rev) {
      return { success: false, error: 'Review not found' };
    }

    rev.status = status;
    if (adminNotes !== undefined) {
      rev.adminNotes = adminNotes;
    }

    // Exclude hidden or removed reviews from the public rating calculation
    const { averageRating, ratingCount } = this.calculateRatingForBusiness(rev.businessId);
    const b = this.data.businesses.find((biz) => biz.id === rev.businessId);
    if (b) {
      b.averageRating = averageRating;
      b.ratingCount = ratingCount;
    }

    this.saveData(this.data);

    this.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Administrator',
      action: status === 'hidden' ? 'hide_review' : 'restore_review',
      targetId: rev.businessId,
      details: `Admin changed review ${reviewId} status to "${status}". Notes: ${adminNotes || 'none'}. New rating: ${averageRating ?? 'None'} (${ratingCount} total).`,
    });

    return {
      success: true,
      review: rev,
      averageRating,
      ratingCount,
    };
  }

  public saveBusiness(business: Business): Business {
    const idx = this.data.businesses.findIndex((b) => b.id === business.id);
    business.updatedAt = new Date().toISOString();

    if (idx >= 0) {
      this.data.businesses[idx] = business;
    } else {
      this.data.businesses.unshift(business);
    }
    this.saveData(this.data);
    return business;
  }

  // Soft delete / archive a business listing (preserves permanent ID and billing/audit history)
  public archiveBusiness(id: string): Business | null {
    const b = this.data.businesses.find((biz) => biz.id === id);
    if (!b) return null;
    b.status = 'archived';
    b.statusReason = 'Archived by business owner';
    b.updatedAt = new Date().toISOString();
    this.saveData(this.data);
    return b;
  }

  // Idempotent payment processing helpers
  public isPaymentEventProcessed(eventId: string): boolean {
    if (!this.data.processedPaymentEvents) return false;
    return this.data.processedPaymentEvents.some((e) => e.eventId === eventId);
  }

  public recordPaymentEvent(eventId: string, businessId: string, amount: number) {
    if (!this.data.processedPaymentEvents) {
      this.data.processedPaymentEvents = [];
    }
    this.data.processedPaymentEvents.unshift({
      eventId,
      businessId,
      amount,
      timestamp: new Date().toISOString(),
    });
    this.saveData(this.data);
  }

  public deleteBusiness(id: string): boolean {
    const before = this.data.businesses.length;
    this.data.businesses = this.data.businesses.filter((b) => b.id !== id);
    if (this.data.businesses.length !== before) {
      this.saveData(this.data);
      return true;
    }
    return false;
  }

  public addModerationAction(action: ModerationAction) {
    this.data.moderationActions.unshift(action);
    this.saveData(this.data);
  }

  public getModerationActions(): ModerationAction[] {
    return this.data.moderationActions;
  }

  public addReport(report: BusinessReport) {
    this.data.reports.unshift(report);
    this.saveData(this.data);
  }

  public getReports(): BusinessReport[] {
    return this.data.reports;
  }

  public updateReport(id: string, status: 'resolved' | 'dismissed', notes?: string) {
    const rep = this.data.reports.find((r) => r.id === id);
    if (rep) {
      rep.status = status;
      if (notes) rep.resolutionNotes = notes;
      this.saveData(this.data);
    }
  }

  public addAuditEvent(event: AuditEvent) {
    this.data.auditEvents.unshift(event);
    this.saveData(this.data);
  }

  public getAuditEvents(): AuditEvent[] {
    return this.data.auditEvents;
  }

  public addReminderLog(reminder: ReminderLog) {
    this.data.reminders.unshift(reminder);
    this.saveData(this.data);
  }

  public getReminderLogs(): ReminderLog[] {
    return this.data.reminders;
  }

  public getUsers(): UserAccount[] {
    return this.data.users;
  }

  public getUserById(id: string): UserAccount | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public getUserByEmail(email: string): UserAccount | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public saveUser(user: UserAccount): UserAccount {
    const idx = this.data.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      this.data.users[idx] = user;
    } else {
      this.data.users.push(user);
    }
    this.saveData(this.data);
    return user;
  }

  public getSystemSettings() {
    return this.data.systemSettings;
  }

  // Periodic expiration & reminder check runner
  public runExpirationAndReminderJob(): {
    hiddenCount: number;
    remindersQueuedCount: number;
    details: string[];
  } {
    const nowTime = new Date().getTime();
    let hiddenCount = 0;
    let remindersQueuedCount = 0;
    const details: string[] = [];

    for (const b of this.data.businesses) {
      if (b.billing && b.billing.expirationDate) {
        const expTime = new Date(b.billing.expirationDate).getTime();
        const reminderTime = b.billing.reminderScheduledDate
          ? new Date(b.billing.reminderScheduledDate).getTime()
          : expTime - 60 * 24 * 60 * 60 * 1000;

        // Check if expiration passed and listing is not already hidden/suspended/rejected
        if (nowTime > expTime && b.status === 'active') {
          b.status = 'hidden_unpaid';
          b.billing.status = 'expired';
          b.statusReason = 'Bimonthly $25 renewal term lapsed. Retained for manual renewal.';
          hiddenCount++;
          details.push(`Listing ${b.name} (${b.id}) transitioned to hidden_unpaid due to term expiration.`);
          
          this.addAuditEvent({
            id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            actor: 'System Scheduler',
            action: 'auto_transition_hidden_unpaid',
            targetId: b.id,
            details: `Bimonthly term expired on ${b.billing.expirationDate}. Visibility removed from public search while preserving ID, URL, QR, and data.`,
          });
        }

        // Check if reminder notice is due and not yet logged
        if (nowTime >= reminderTime && !b.billing.reminderSent && b.status === 'active') {
          b.billing.reminderSent = true;
          b.billing.reminderSentDate = new Date().toISOString();
          remindersQueuedCount++;
          
          const reminderEntry: ReminderLog = {
            id: `rem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            businessId: b.id,
            businessName: b.name,
            ownerEmail: b.ownerEmail,
            expirationDate: b.billing.expirationDate,
            sentAt: new Date().toISOString(),
            deliveryStatus: 'simulated_delivered',
            message: `Notice: Your advertising term expires on ${new Date(expTime).toLocaleDateString()}. Manual renewal ($25 every 2 months) is available in your owner dashboard.`,
          };
          this.addReminderLog(reminderEntry);
          details.push(`Renewal notice logged for ${b.name} (${b.ownerEmail}).`);
        }
      }
    }

    if (hiddenCount > 0 || remindersQueuedCount > 0) {
      this.saveData(this.data);
    }

    return { hiddenCount, remindersQueuedCount, details };
  }

  public getReferrals(businessId?: string): ReferralRecord[] {
    if (!this.data.referrals) {
      this.data.referrals = [];
    }
    if (businessId) {
      return this.data.referrals.filter(
        (r) => r.referrerBusinessId === businessId || r.referredBusinessId === businessId
      );
    }
    return this.data.referrals;
  }

  public addReferral(record: ReferralRecord): ReferralRecord {
    if (!this.data.referrals) {
      this.data.referrals = [];
    }
    this.data.referrals.push(record);
    this.saveData(this.data);
    return record;
  }

  public updateReferral(record: ReferralRecord): ReferralRecord {
    if (!this.data.referrals) {
      this.data.referrals = [];
    }
    const idx = this.data.referrals.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      this.data.referrals[idx] = record;
    } else {
      this.data.referrals.push(record);
    }
    this.saveData(this.data);
    return record;
  }

  public getBusinessByReferralCode(code: string): Business | undefined {
    const clean = code.trim().toUpperCase();
    return this.data.businesses.find(
      (b) =>
        b.billing?.referralCode?.toUpperCase() === clean ||
        b.referralCode?.toUpperCase() === clean ||
        `REF-${b.id.replace('sk-', '').toUpperCase()}` === clean
    );
  }
}

export const db = new PipSqueakDB();
