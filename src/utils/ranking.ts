import type { Business, CustomerReview, EngagementRankingTier } from '../types/pipsqueak.ts';

export type { EngagementRankingTier };

export const ROLLING_WINDOW_DAYS = 90;
export const ROLLING_WINDOW_MS = ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Maximum points per component (sum = 100)
export const MAX_REVIEW_POINTS = 40;
export const MAX_CLICK_POINTS = 35;
export const MAX_OWNER_ACTIVITY_POINTS = 25;
export const MAX_TOTAL_SCORE = 100;

// Component scoring rates
export const POINTS_PER_APPROVED_REVIEW = 10; // 4 approved reviews = 40 pts max
export const POINTS_PER_UNIQUE_CLICK = 1;     // 35 unique consumer clicks = 35 pts max
export const POINTS_PER_OWNER_ACTIVITY = 5;   // 5 meaningful owner actions = 25 pts max

export interface RankingBreakdown {
  reviewPoints: number;
  clickPoints: number;
  ownerActivityPoints: number;
  approvedReviewsCount: number;
  uniqueClicksCount: number;
  ownerActivitiesCount: number;
  totalScore: number;
  windowDays: number;
}

export interface RankingDetails {
  tier: EngagementRankingTier;
  label: string;
  badgeText: string;
  starColor: string; // Tailwind text color
  starFill: string; // Tailwind fill color
  badgeBg: string;
  badgeBorder: string;
  badgeTextClass: string;
  description: string;
  score: number;
  breakdown: RankingBreakdown;
}

export interface CalculateRankingOptions {
  reviews?: CustomerReview[];
  now?: number; // Defaults to Date.now()
  // Explicit overrides for direct unit testing
  overrideApprovedReviewsCount?: number;
  overrideUniqueClicksCount?: number;
  overrideOwnerActivitiesCount?: number;
}

export interface RecordClickOptions {
  userRole?: string;
  userId?: string;
  userAgent?: string;
  visitorToken?: string;
  timestamp?: number;
}

export interface RecordActivityOptions {
  actorId?: string;
  actorRole?: string;
  type: 'review_response' | 'listing_update' | 'hours_update' | 'info_update';
  description?: string;
  timestamp?: number;
}

/**
 * Detects known bot / crawler / automated scraper user agents.
 */
export function isBotUserAgent(userAgent?: string): boolean {
  if (!userAgent) return false;
  return /bot|crawler|spider|crawling|slurp|bingbot|googlebot|yandex|baidu|headless|phantom|wget|curl|axios|node-fetch/i.test(
    userAgent
  );
}

/**
 * Deduplicates repeat consumer clicks/refreshes and excludes owners, staff, admins, and bots.
 * Privacy-safe: NO IP addresses or personal data are stored.
 */
export function recordConsumerProfileClick(
  business: Business,
  options: RecordClickOptions = {}
): { recorded: boolean; reason?: string } {
  const timestamp = options.timestamp !== undefined ? options.timestamp : Date.now();
  const dateStr = new Date(timestamp).toISOString().split('T')[0];

  // 1. Exclude bot user agents
  if (options.userAgent && isBotUserAgent(options.userAgent)) {
    return { recorded: false, reason: 'bot_excluded' };
  }

  // 2. Exclude business owner
  if (options.userId && options.userId === business.ownerId) {
    return { recorded: false, reason: 'owner_excluded' };
  }

  // 3. Exclude staff members
  if (options.userId && business.staff && business.staff.some((s) => s.userId === options.userId)) {
    return { recorded: false, reason: 'staff_excluded' };
  }

  // 4. Exclude admins
  if (options.userRole === 'admin') {
    return { recorded: false, reason: 'admin_excluded' };
  }

  if (!business.engagement) {
    business.engagement = {};
  }
  if (!business.engagement.consumerClicks) {
    business.engagement.consumerClicks = [];
  }

  // Deduplicate repeat clicks/refreshes within the same day + anonymous token
  const token = (options.visitorToken && options.visitorToken.trim()) || 'anon-visitor';
  const key = `${dateStr}_${token}`;

  const alreadyClicked = business.engagement.consumerClicks.some(
    (c) => `${c.date}_${c.anonymousToken}` === key
  );

  if (alreadyClicked) {
    return { recorded: false, reason: 'duplicate_click_deduplicated' };
  }

  // Privacy-safe: only store date string, anonymous token, and timestamp (NO IP addresses)
  business.engagement.consumerClicks.push({
    date: dateStr,
    anonymousToken: token,
    timestamp,
  });

  // Prune clicks older than 90 days
  const windowStart = timestamp - ROLLING_WINDOW_MS;
  business.engagement.consumerClicks = business.engagement.consumerClicks.filter(
    (c) => c.timestamp >= windowStart
  );

  return { recorded: true };
}

/**
 * Records meaningful owner business activity (such as responding to reviews or updating business info).
 * Excludes trivial repeated edits within 1 hour.
 */
export function recordMeaningfulOwnerActivity(
  business: Business,
  options: RecordActivityOptions
): { recorded: boolean; reason?: string } {
  const timestamp = options.timestamp !== undefined ? options.timestamp : Date.now();

  const isOwner = options.actorId === business.ownerId;
  const isStaff = business.staff?.some((s) => s.userId === options.actorId);
  const isAdmin = options.actorRole === 'admin';

  if (!isOwner && !isStaff && !isAdmin) {
    return { recorded: false, reason: 'unauthorized_actor' };
  }

  if (!business.engagement) {
    business.engagement = {};
  }
  if (!business.engagement.ownerActivities) {
    business.engagement.ownerActivities = [];
  }

  // Exclude trivial repeated edits (same action type within 1 hour)
  const oneHourAgo = timestamp - 60 * 60 * 1000;
  const recentSameType = business.engagement.ownerActivities.some(
    (a) => a.type === options.type && a.timestamp > oneHourAgo
  );

  if (recentSameType) {
    return { recorded: false, reason: 'trivial_repeated_edit_excluded' };
  }

  business.engagement.ownerActivities.push({
    id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    type: options.type,
    timestamp,
    description: options.description,
  });

  // Prune activities older than 90 days
  const windowStart = timestamp - ROLLING_WINDOW_MS;
  business.engagement.ownerActivities = business.engagement.ownerActivities.filter(
    (a) => a.timestamp >= windowStart
  );

  return { recorded: true };
}

/**
 * Calculates system engagement ranking strictly from genuine rolling 90-day activity.
 * 
 * Rules:
 * - Approved customer comments/reviews (up to 40 points)
 * - Unique consumer profile clicks (up to 35 points)
 * - Meaningful owner business activity (up to 25 points)
 * - Total score: 0–100
 * - Tiers: Silver (0–39), Gold (40–59), Platinum (60–79), Diamond (80–100)
 * - Explicitly NO points for profile completeness, advertising spend/terms, flyers, paid placement, or catalog size.
 */
export function calculateBusinessRanking(
  business: Partial<Business>,
  options?: CalculateRankingOptions
): RankingDetails {
  const now = options?.now !== undefined ? options.now : Date.now();
  const windowStart = now - ROLLING_WINDOW_MS;

  const hasExplicitSignals =
    options?.overrideApprovedReviewsCount !== undefined ||
    options?.overrideUniqueClicksCount !== undefined ||
    options?.overrideOwnerActivitiesCount !== undefined ||
    (options?.reviews !== undefined && options.reviews.length > 0) ||
    Boolean(business.engagement?.consumerClicks && business.engagement.consumerClicks.length > 0) ||
    Boolean(business.engagement?.ownerActivities && business.engagement.ownerActivities.length > 0);

  // If already calculated and no raw signals provided (e.g. consumer view of sanitized business projection)
  if (!hasExplicitSignals && business.rankingScore !== undefined && business.rankingTier !== undefined) {
    const totalScore = Math.max(0, Math.min(MAX_TOTAL_SCORE, business.rankingScore));
    const tier = business.rankingTier;
    return createRankingResult(tier, totalScore, {
      reviewPoints: 0,
      clickPoints: 0,
      ownerActivityPoints: 0,
      approvedReviewsCount: 0,
      uniqueClicksCount: 0,
      ownerActivitiesCount: 0,
      totalScore,
      windowDays: ROLLING_WINDOW_DAYS,
    });
  }

  // 1. SIGNAL 1: Approved customer comments/reviews (up to 40 points)
  let approvedReviewsCount = 0;
  if (options?.overrideApprovedReviewsCount !== undefined) {
    approvedReviewsCount = options.overrideApprovedReviewsCount;
  } else if (options?.reviews && options.reviews.length > 0) {
    approvedReviewsCount = options.reviews.filter((r) => {
      if (r.status !== 'published' && (r as any).status !== 'approved') return false;
      const reviewTime = new Date(r.createdAt).getTime();
      return reviewTime >= windowStart && reviewTime <= now;
    }).length;
  } else if (business.engagement && business.engagement.consumerClicks !== undefined) {
    approvedReviewsCount = 0;
  }

  const reviewPoints = Math.min(MAX_REVIEW_POINTS, approvedReviewsCount * POINTS_PER_APPROVED_REVIEW);

  // 2. SIGNAL 2: Unique consumer profile clicks (up to 35 points)
  let uniqueClicksCount = 0;
  if (options?.overrideUniqueClicksCount !== undefined) {
    uniqueClicksCount = options.overrideUniqueClicksCount;
  } else if (business.engagement?.consumerClicks) {
    // Deduplicate by date + anonymous token within rolling 90 days
    const seen = new Set<string>();
    for (const click of business.engagement.consumerClicks) {
      if (click.timestamp >= windowStart && click.timestamp <= now) {
        const key = `${click.date || 'd'}_${click.anonymousToken}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueClicksCount++;
        }
      }
    }
  }

  const clickPoints = Math.min(MAX_CLICK_POINTS, uniqueClicksCount * POINTS_PER_UNIQUE_CLICK);

  // 3. SIGNAL 3: Meaningful owner business activity (up to 25 points)
  let ownerActivitiesCount = 0;
  if (options?.overrideOwnerActivitiesCount !== undefined) {
    ownerActivitiesCount = options.overrideOwnerActivitiesCount;
  } else if (business.engagement?.ownerActivities) {
    ownerActivitiesCount = business.engagement.ownerActivities.filter((act) => {
      return act.timestamp >= windowStart && act.timestamp <= now;
    }).length;
  }

  const ownerActivityPoints = Math.min(MAX_OWNER_ACTIVITY_POINTS, ownerActivitiesCount * POINTS_PER_OWNER_ACTIVITY);

  // 4. TOTAL SCORE: 0–100
  const totalScore = Math.max(0, Math.min(MAX_TOTAL_SCORE, reviewPoints + clickPoints + ownerActivityPoints));

  // 5. TIER ASSIGNMENT:
  // Silver: 0–39
  // Gold: 40–59
  // Platinum: 60–79
  // Diamond: 80–100
  let tier: EngagementRankingTier = 'Silver';
  if (totalScore >= 80) {
    tier = 'Diamond';
  } else if (totalScore >= 60) {
    tier = 'Platinum';
  } else if (totalScore >= 40) {
    tier = 'Gold';
  } else {
    tier = 'Silver';
  }

  const breakdown: RankingBreakdown = {
    reviewPoints,
    clickPoints,
    ownerActivityPoints,
    approvedReviewsCount,
    uniqueClicksCount,
    ownerActivitiesCount,
    totalScore,
    windowDays: ROLLING_WINDOW_DAYS,
  };

  return createRankingResult(tier, totalScore, breakdown);
}

function createRankingResult(
  tier: EngagementRankingTier,
  score: number,
  breakdown: RankingBreakdown
): RankingDetails {
  switch (tier) {
    case 'Diamond':
      return {
        tier: 'Diamond',
        label: 'Diamond Tier',
        badgeText: 'Diamond Rank',
        starColor: 'text-cyan-600',
        starFill: 'fill-cyan-400',
        badgeBg: 'bg-cyan-50',
        badgeBorder: 'border-cyan-200',
        badgeTextClass: 'text-cyan-900',
        description:
          'Diamond Engagement Rank (80–100): High volume of recent verified customer reviews, unique community profile clicks, and active owner management over the rolling 90 days.',
        score,
        breakdown,
      };
    case 'Platinum':
      return {
        tier: 'Platinum',
        label: 'Platinum Tier',
        badgeText: 'Platinum Rank',
        starColor: 'text-indigo-600',
        starFill: 'fill-indigo-400',
        badgeBg: 'bg-indigo-50',
        badgeBorder: 'border-indigo-200',
        badgeTextClass: 'text-indigo-900',
        description:
          'Platinum Engagement Rank (60–79): Strong 90-day engagement across customer reviews, unique consumer profile clicks, and regular owner activity.',
        score,
        breakdown,
      };
    case 'Gold':
      return {
        tier: 'Gold',
        label: 'Gold Tier',
        badgeText: 'Gold Rank',
        starColor: 'text-amber-600',
        starFill: 'fill-amber-400',
        badgeBg: 'bg-amber-50',
        badgeBorder: 'border-amber-200',
        badgeTextClass: 'text-amber-900',
        description:
          'Gold Engagement Rank (40–59): Active local profile with consistent 90-day community interactions, customer reviews, and owner management.',
        score,
        breakdown,
      };
    case 'Silver':
    default:
      return {
        tier: 'Silver',
        label: 'Silver Tier',
        badgeText: 'Silver Rank',
        starColor: 'text-slate-500',
        starFill: 'fill-slate-400',
        badgeBg: 'bg-slate-50',
        badgeBorder: 'border-slate-200',
        badgeTextClass: 'text-slate-800',
        description:
          'Silver Engagement Rank (0–39): Entry baseline engagement tier for registered local business profiles.',
        score,
        breakdown,
      };
  }
}
