export type UserRole = 'visitor' | 'owner' | 'staff' | 'admin';

export type StaffPermission =
  | 'edit_profile'
  | 'edit_photos'
  | 'edit_menu'
  | 'edit_services'
  | 'edit_flyer';

export interface StaffMember {
  id: string;
  userId: string;
  email: string;
  name: string;
  permissions: StaffPermission[];
  invitedAt: string;
}

export type ListingStatus =
  | 'draft'
  | 'pending_payment'
  | 'active'
  | 'hidden_unpaid'
  | 'paused'
  | 'suspended'
  | 'rejected'
  | 'archived';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  price?: string;
}

export interface BusinessHours {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

export interface Flyer {
  id: string;
  businessId: string;
  headline: string;
  offerDetails: string;
  photoUrl: string;
  accentColor: string;
  template: 'modern' | 'bold' | 'minimal' | 'craft';
  status: 'draft' | 'published';
  updatedAt: string;
}

export interface PaymentState {
  status: 'unpaid' | 'paid' | 'expired' | 'grace_period';
  isInitialSignUpPaid: boolean; // Initial $19.99 enrollment verified
  initialSignUpFee: number; // $19.99 initial enrollment
  renewalFee: number; // $25 per 2-month period ($12.50 with referral discount)
  quarterlyFee?: number; // legacy alias
  termMonths: number; // 2 months
  termStartDate?: string;
  paidThroughDate?: string;
  expirationDate?: string;
  reminderScheduledDate?: string;
  reminderSent: boolean;
  reminderSentDate?: string;
  providerReference?: string;
  receiptNumber?: string;
  lastPaymentVerifiedAt?: string;
  hasReferralDiscount?: boolean; // 50% off first renewal only ($12.50)
  referralCode?: string;
  referredBy?: string;
  referralsCount?: number;
}

export interface ReferralRecord {
  id: string;
  referrerBusinessId: string;
  referrerOwnerEmail: string;
  referredBusinessId: string;
  referredBusinessName: string;
  createdAt: string;
  status: 'pending' | 'qualified_discount_available' | 'discount_redeemed';
  discountRedeemedAt?: string;
}

export interface PlacePrediction {
  text: string;
  type: string;
  detail: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  lat?: number;
  lng?: number;
}

export type BusinessLocationType = 'Home-based' | 'Mobile business' | 'Brick-and-mortar location';
export type EngagementRankingTier = 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export const EngagementRankingTier = {
  Silver: 'Silver',
  Gold: 'Gold',
  Platinum: 'Platinum',
  Diamond: 'Diamond',
} as const;

export interface ConsumerClickRecord {
  date: string; // YYYY-MM-DD
  anonymousToken: string; // Privacy-safe anonymous token (no IP address or personal data)
  timestamp: number;
}

export interface OwnerActivityRecord {
  id: string;
  type: string;
  timestamp: number;
  description?: string;
}

export interface EngagementLedger {
  consumerClicks?: ConsumerClickRecord[];
  ownerActivities?: OwnerActivityRecord[];
}

export interface Business {
  id: string; // permanent unique public business ID (e.g. sk-9c2b48a1)
  ownerId: string;
  ownerEmail: string;
  name: string;
  entityType?: 'Sole Proprietor' | 'LLC' | 'Corporation' | 'Partnership' | 'Other';
  shortDescription: string;
  category: string; // Category ID
  subcategory?: string;
  customCategory?: string; // For "Other / Not Listed"
  customSubcategory?: string;
  keywords: string[];
  address: string;
  city: string;
  state: string;
  zipCode: string;
  serviceArea: string;
  isServiceAreaOnly?: boolean;
  locationType?: 'storefront' | 'service_area' | 'online_only';
  businessLocationType?: BusinessLocationType;
  homeVisitAllowed?: boolean; // Required Yes/No if Home-based: "Is it okay for customers to visit your private residence?"
  futureBusinessAddress?: string; // Optional for Mobile business
  rankingTier?: EngagementRankingTier; // System-calculated engagement tier (Silver, Gold, Platinum, Diamond)
  rankingScore?: number; // 0-100 system engagement score from 90-day rolling window
  engagement?: EngagementLedger; // Privacy-safe 90-day engagement metrics ledger
  publishStreetAddress?: boolean;
  referralCode?: string;
  referredBy?: string;
  phone: string;
  smsCapable?: boolean; // Owner confirms SMS capability (default true for mobile/standard phones)
  email: string;
  website: string;
  orderOnlineUrl?: string;
  bookingUrl?: string;
  ein?: string;
  hasEin?: 'Yes' | 'No' | 'Prefer not to answer';
  hasInsurance?: boolean;
  hasInsuranceStatus?: 'Yes' | 'No' | 'Prefer not to answer';
  insuranceDetails?: string;
  directionsUrl?: string;
  logoUrl?: string;
  photos: string[];
  menuPhotos: string[]; // required for restaurants before publish
  menuFileUrl?: string;
  menuItems: MenuItem[];
  services: ServiceItem[];
  hours: BusinessHours;
  status: ListingStatus;
  statusReason?: string;
  staff: StaffMember[];
  billing: PaymentState;
  flyer?: Flyer;
  averageRating?: number | null; // automatically computed from published reviews
  ratingCount?: number; // count of published reviews
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerReview {
  id: string;
  businessId: string;
  reviewerName: string; // Public display name (never private email or phone)
  rating: number; // 1-5 stars
  comment?: string;
  createdAt: string;
  status: 'published' | 'hidden';
  flaggedByOwner: boolean;
  flagReason?: string;
  flaggedAt?: string;
  adminNotes?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  subcategories?: string[];
  suggestedKeywords: string[];
  requiresMenu: boolean;
  categoryFields?: {
    id: string;
    label: string;
    type: 'text' | 'select' | 'boolean';
    options?: string[];
    required?: boolean;
  }[];
  isArchived?: boolean;
  isCustom?: boolean;
}

export interface ModerationAction {
  id: string;
  businessId: string;
  businessName: string;
  previousStatus: ListingStatus;
  newStatus: ListingStatus;
  reason: string;
  actor: string;
  timestamp: string;
}

export interface BusinessReport {
  id: string;
  businessId: string;
  businessName: string;
  reporterEmail: string;
  reason: string;
  details: string;
  timestamp: string;
  status: 'pending' | 'resolved' | 'dismissed';
  resolutionNotes?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  aal?: 'aal1' | 'aal2';
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  targetId: string;
  details: string;
}

export interface ReminderLog {
  id: string;
  businessId: string;
  businessName: string;
  ownerEmail: string;
  expirationDate: string;
  sentAt: string;
  deliveryStatus: 'simulated_delivered' | 'failed' | 'unconfigured';
  message: string;
}

export interface SystemIntegrations {
  database: {
    configured: boolean;
    status: string;
    detail: string;
  };
  payment: {
    configured: boolean;
    provider: string;
    status: string;
    detail: string;
  };
  email: {
    configured: boolean;
    status: string;
    detail: string;
  };
  places: {
    configured: boolean;
    status: string;
    detail: string;
  };
  scheduler: {
    configured: boolean;
    status: string;
    detail: string;
  };
}
