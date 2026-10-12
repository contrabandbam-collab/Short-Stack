import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/server/db.ts';
import { createApiApp, resetSessionToVisitor, setSessionUser } from '../server.ts';
import { calculateBusinessRanking } from '../src/utils/ranking.ts';
import type { Server } from 'node:http';

describe('Business Location Setup & System Ranking Suite', () => {
  let appServer: Server;
  let baseUrl: string;
  let initialDbSnapshot: any;
  let originalEnv: NodeJS.ProcessEnv;

  before(async () => {
    db.setTestMode(true);
    initialDbSnapshot = db.getSnapshot();
    originalEnv = { ...process.env };

    const app = createApiApp();
    await new Promise<void>((resolve) => {
      appServer = app.listen(0, '127.0.0.1', () => {
        const addr = appServer.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (appServer) {
      await new Promise<void>((resolve) => appServer.close(() => resolve()));
    }
    process.env = originalEnv;
    db.restoreSnapshot(initialDbSnapshot);
    db.setTestMode(false);
  });

  beforeEach(() => {
    db.restoreSnapshot(initialDbSnapshot);
    resetSessionToVisitor();
  });

  // Helper to authenticate as a test owner
  function authenticateTestOwner() {
    setSessionUser({
      id: 'owner-test-loc-user',
      email: 'testowner@shortstack.local',
      name: 'Location Test Owner',
      role: 'owner',
      aal: 'aal2',
    });
  }

  // ==========================================
  // 1. BUSINESS LOCATION SETUP TESTS
  // ==========================================
  describe('Business Location Types & Privacy Enforcement', () => {
    test('Home-based with No visits: server strips and refuses to save personal home street address', async () => {
      authenticateTestOwner();

      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Cozy Crafts Home Studio',
          category: 'retail-shopping',
          businessLocationType: 'Home-based',
          homeVisitAllowed: false,
          address: '742 Evergreen Terrace', // Crafted address attempt
          city: 'Seattle',
          state: 'WA',
          zipCode: '98103',
          serviceArea: 'Greater Seattle Area',
          phone: '(206) 555-8822',
        }),
      });

      assert.equal(createRes.status, 200);
      const data = await createRes.json();
      assert.equal(data.business.businessLocationType, 'Home-based');
      assert.equal(data.business.homeVisitAllowed, false);
      // Street address MUST be completely stripped
      assert.equal(data.business.address, '');
      assert.equal(data.business.publishStreetAddress, false);
      assert.equal(data.business.isServiceAreaOnly, true);

      // Verify public projection as a public visitor also does NOT expose street address
      resetSessionToVisitor();
      const bizRecord = db.getBusinessById(data.business.id)!;
      bizRecord.status = 'active'; // Allow public retrieval
      db.saveBusiness(bizRecord);
      const pubRes = await fetch(`${baseUrl}/api/businesses/${data.business.id}`);
      assert.equal(pubRes.status, 200);
      const pubData = await pubRes.json();
      assert.equal(pubData.business.address, '');
      assert.equal(pubData.business.directionsUrl, undefined);
      assert.equal(pubData.business.city, 'Seattle');
      assert.equal(pubData.business.serviceArea, 'Greater Seattle Area');
    });

    test('Home-based with Yes visits: accepts and persists residential address for customer visits', async () => {
      authenticateTestOwner();

      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Pottery by Sara Residential Studio',
          category: 'arts-entertainment',
          businessLocationType: 'Home-based',
          homeVisitAllowed: true,
          address: '420 Westlake Ave N',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98109',
          publishStreetAddress: true,
          phone: '(206) 555-3344',
        }),
      });

      assert.equal(createRes.status, 200);
      const data = await createRes.json();
      assert.equal(data.business.businessLocationType, 'Home-based');
      assert.equal(data.business.homeVisitAllowed, true);
      assert.equal(data.business.address, '420 Westlake Ave N');
    });

    test('Home-based switching Yes to No: clears and blocks private address from exposure and logs audit event', async () => {
      authenticateTestOwner();

      // First create with Yes
      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Home Bakery Testing',
          category: 'restaurants-food',
          businessLocationType: 'Home-based',
          homeVisitAllowed: true,
          address: '888 Residential Lane',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
          publishStreetAddress: true,
          phone: '(206) 555-9900',
        }),
      });
      const data = await createRes.json();
      const bizId = data.business.id;

      // Now owner changes homeVisitAllowed from Yes to No
      const updateRes = await fetch(`${baseUrl}/api/businesses/${bizId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeVisitAllowed: false,
          address: '888 Residential Lane', // Even if submitted, server clears it
        }),
      });

      assert.equal(updateRes.status, 200);
      const updatedData = await updateRes.json();
      assert.equal(updatedData.business.homeVisitAllowed, false);
      assert.equal(updatedData.business.address, '');
      assert.equal(updatedData.business.publishStreetAddress, false);
      assert.equal(updatedData.business.isServiceAreaOnly, true);

      // Verify public API returns cleared address as a public visitor
      resetSessionToVisitor();
      const updatedBiz = db.getBusinessById(bizId)!;
      updatedBiz.status = 'active';
      db.saveBusiness(updatedBiz);
      const pubRes = await fetch(`${baseUrl}/api/businesses/${bizId}`);
      const pubData = await pubRes.json();
      assert.equal(pubData.business.address, '');
      assert.equal(pubData.business.directionsUrl, undefined);
    });

    test('Mobile business: does not require street address and persists optional future business address', async () => {
      authenticateTestOwner();

      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Cascadia Food Truck Co',
          category: 'restaurants-food',
          businessLocationType: 'Mobile business',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98104',
          serviceArea: 'King & Snohomish Counties',
          futureBusinessAddress: '500 Pike St (Future Food Hall Stall)',
          phone: '(206) 555-7711',
        }),
      });

      assert.equal(createRes.status, 200);
      const data = await createRes.json();
      assert.equal(data.business.businessLocationType, 'Mobile business');
      assert.equal(data.business.address, '');
      assert.equal(data.business.futureBusinessAddress, '500 Pike St (Future Food Hall Stall)');
      assert.equal(data.business.isServiceAreaOnly, true);
    });

    test('Mobile business can remain completely blank for future business address without blocking', async () => {
      authenticateTestOwner();

      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mobile Detailing Squad',
          category: 'auto-marine',
          businessLocationType: 'Mobile business',
          city: 'Bellevue',
          state: 'WA',
          serviceArea: 'Eastside Metro Area',
          phone: '(425) 555-9090',
        }),
      });

      assert.equal(createRes.status, 200);
      const data = await createRes.json();
      assert.equal(data.business.businessLocationType, 'Mobile business');
      assert.equal(data.business.address, '');
      assert.equal(data.business.futureBusinessAddress, undefined);
    });

    test('Brick-and-mortar location: keeps normal street address flow', async () => {
      authenticateTestOwner();

      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Downtown Coffee Corner',
          category: 'restaurants-food',
          businessLocationType: 'Brick-and-mortar location',
          address: '1420 5th Ave',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
          publishStreetAddress: true,
          phone: '(206) 555-1122',
        }),
      });

      assert.equal(createRes.status, 200);
      const data = await createRes.json();
      assert.equal(data.business.businessLocationType, 'Brick-and-mortar location');
      assert.equal(data.business.address, '1420 5th Ave');
      assert.equal(data.business.isServiceAreaOnly, false);
    });
  });

  // ==========================================
  // 2. SYSTEM ENGAGEMENT RANKING TESTS (90-DAY ROLLING WINDOW)
  // ==========================================
  describe('System Engagement Ranking (Silver, Gold, Platinum, Diamond)', () => {
    test('Silver Tier (0–39): baseline profile with no recent engagement', () => {
      const ranking = calculateBusinessRanking({
        name: 'New Local Shop',
        category: 'retail-shopping',
      });
      assert.equal(ranking.tier, 'Silver');
      assert.equal(ranking.badgeText, 'Silver Rank');
      assert.match(ranking.starColor, /slate/);
      assert.equal(ranking.score, 0);
      assert.equal(ranking.breakdown.totalScore, 0);
    });

    test('Zero rank points awarded for profile completeness, advertising, flyers, catalog size, or billing', () => {
      // Even if business has 100% completed profile, large catalog, paid billing, active flyer:
      // without rolling 90-day customer reviews, unique clicks, or owner activity, score MUST remain 0 (Silver)
      const ranking = calculateBusinessRanking({
        name: 'Fully Detailed Shop with No Engagement',
        category: 'restaurants-food',
        shortDescription: 'Comprehensive profile with all details filled out.',
        phone: '(206) 555-1234',
        email: 'shop@example.com',
        website: 'https://shop.example.com',
        photos: ['photo1.jpg', 'photo2.jpg', 'photo3.jpg'],
        logoUrl: 'logo.jpg',
        hours: {
          monday: '9am-5pm',
          tuesday: '9am-5pm',
          wednesday: '9am-5pm',
          thursday: '9am-5pm',
          friday: '9am-5pm',
          saturday: '10am-4pm',
          sunday: 'Closed',
        },
        menuItems: [
          { id: 'm1', name: 'Item 1', description: 'Desc 1', price: '$10' },
          { id: 'm2', name: 'Item 2', description: 'Desc 2', price: '$15' },
          { id: 'm3', name: 'Item 3', description: 'Desc 3', price: '$20' },
        ],
        flyer: { id: 'f1', businessId: 'b1', headline: 'Big Ad Sale', offerDetails: '50% off' } as any,
        billing: { status: 'paid', initialSignUpFee: 19.99, quarterlyFee: 25 } as any,
      });

      assert.equal(ranking.tier, 'Silver');
      assert.equal(ranking.score, 0);
      assert.equal(ranking.breakdown.reviewPoints, 0);
      assert.equal(ranking.breakdown.clickPoints, 0);
      assert.equal(ranking.breakdown.ownerActivityPoints, 0);
    });

    test('Signal weights and caps: reviews (max 40), clicks (max 35), owner activity (max 25) = 100 max', () => {
      // Over-capped reviews: 10 reviews * 10 = 100 -> capped at 40
      const reviewCapped = calculateBusinessRanking({}, { overrideApprovedReviewsCount: 10 });
      assert.equal(reviewCapped.breakdown.reviewPoints, 40);

      // Over-capped clicks: 50 clicks * 1 = 50 -> capped at 35
      const clickCapped = calculateBusinessRanking({}, { overrideUniqueClicksCount: 50 });
      assert.equal(clickCapped.breakdown.clickPoints, 35);

      // Over-capped owner activity: 10 activities * 5 = 50 -> capped at 25
      const ownerCapped = calculateBusinessRanking({}, { overrideOwnerActivitiesCount: 10 });
      assert.equal(ownerCapped.breakdown.ownerActivityPoints, 25);

      // Combined max score = 100 (Diamond)
      const maxRanking = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4,  // 40 pts
        overrideUniqueClicksCount: 35,    // 35 pts
        overrideOwnerActivitiesCount: 5,  // 25 pts
      });
      assert.equal(maxRanking.score, 100);
      assert.equal(maxRanking.tier, 'Diamond');
    });

    test('All tier boundaries: Silver (0–39), Gold (40–59), Platinum (60–79), Diamond (80–100)', () => {
      // Silver upper boundary: 39 points
      const silver39 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 3, // 30 pts
        overrideUniqueClicksCount: 9,    // 9 pts
      });
      assert.equal(silver39.score, 39);
      assert.equal(silver39.tier, 'Silver');
      assert.equal(silver39.badgeText, 'Silver Rank');
      assert.match(silver39.starColor, /slate/);

      // Gold lower boundary: 40 points
      const gold40 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
      });
      assert.equal(gold40.score, 40);
      assert.equal(gold40.tier, 'Gold');
      assert.equal(gold40.badgeText, 'Gold Rank');
      assert.match(gold40.starColor, /amber/);

      // Gold upper boundary: 59 points
      const gold59 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 19,   // 19 pts
      });
      assert.equal(gold59.score, 59);
      assert.equal(gold59.tier, 'Gold');

      // Platinum lower boundary: 60 points
      const plat60 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 20,   // 20 pts
      });
      assert.equal(plat60.score, 60);
      assert.equal(plat60.tier, 'Platinum');
      assert.equal(plat60.badgeText, 'Platinum Rank');
      assert.match(plat60.starColor, /indigo/);

      // Platinum upper boundary: 79 points
      const plat79 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 35,   // 35 pts (max)
        overrideOwnerActivitiesCount: 0, // 0 pts -> total 75 pts + 4 = override
      });
      assert.equal(plat79.score, 75);
      assert.equal(plat79.tier, 'Platinum');

      // Platinum at 79: 40 + 29 + 10 = 79
      const plat79Exact = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 29,   // 29 pts
        overrideOwnerActivitiesCount: 2, // 10 pts
      });
      assert.equal(plat79Exact.score, 79);
      assert.equal(plat79Exact.tier, 'Platinum');

      // Diamond lower boundary: 80 points
      const diamond80 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 30,   // 30 pts
        overrideOwnerActivitiesCount: 2, // 10 pts
      });
      assert.equal(diamond80.score, 80);
      assert.equal(diamond80.tier, 'Diamond');
      assert.equal(diamond80.badgeText, 'Diamond Rank');
      assert.match(diamond80.starColor, /cyan/);

      // Diamond upper boundary: 100 points
      const diamond100 = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 35,   // 35 pts
        overrideOwnerActivitiesCount: 5, // 25 pts
      });
      assert.equal(diamond100.score, 100);
      assert.equal(diamond100.tier, 'Diamond');
    });

    test('Rolling 90-day window: activities older than 90 days are excluded', () => {
      const now = Date.now();
      const ninetyOneDaysAgo = now - (91 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = now - (10 * 24 * 60 * 60 * 1000);

      // Reviews: one 10 days ago (active), one 91 days ago (expired)
      const reviews = [
        {
          id: 'r1',
          businessId: 'b1',
          userId: 'u1',
          userName: 'Alice',
          rating: 5,
          text: 'Great experience!',
          status: 'published',
          createdAt: new Date(tenDaysAgo).toISOString(),
        },
        {
          id: 'r2',
          businessId: 'b1',
          userId: 'u2',
          userName: 'Bob',
          rating: 5,
          text: 'Old review from last year',
          status: 'published',
          createdAt: new Date(ninetyOneDaysAgo).toISOString(),
        },
      ] as any[];

      const ranking = calculateBusinessRanking(
        {
          engagement: {
            consumerClicks: [
              { date: '2026-09-28', anonymousToken: 'tok-1', timestamp: tenDaysAgo },
              { date: '2026-07-01', anonymousToken: 'tok-2', timestamp: ninetyOneDaysAgo }, // expired
            ],
            ownerActivities: [
              { id: 'a1', type: 'update_hours', timestamp: tenDaysAgo, description: 'Updated hours' },
              { id: 'a2', type: 'update_hours', timestamp: ninetyOneDaysAgo, description: 'Old update' }, // expired
            ],
          },
        },
        { reviews, now }
      );

      // Only the within-90-day signals count:
      // 1 review = 10 pts
      // 1 click = 1 pt
      // 1 owner activity = 5 pts
      // total = 16 pts (Silver)
      assert.equal(ranking.breakdown.approvedReviewsCount, 1);
      assert.equal(ranking.breakdown.uniqueClicksCount, 1);
      assert.equal(ranking.breakdown.ownerActivitiesCount, 1);
      assert.equal(ranking.breakdown.reviewPoints, 10);
      assert.equal(ranking.breakdown.clickPoints, 1);
      assert.equal(ranking.breakdown.ownerActivityPoints, 5);
      assert.equal(ranking.score, 16);
      assert.equal(ranking.tier, 'Silver');
    });

    test('Click deduplication & exclusions: repeat clicks within same day are deduplicated', () => {
      const now = Date.now();
      const todayStr = new Date(now).toISOString().split('T')[0];

      // Multiple clicks from same anonymous visitor on same day
      const business: any = {
        ownerId: 'owner-123',
        staff: [{ userId: 'staff-456' }],
        engagement: {
          consumerClicks: [
            { date: todayStr, anonymousToken: 'visitor-A', timestamp: now - 5000 },
            { date: todayStr, anonymousToken: 'visitor-A', timestamp: now - 3000 }, // duplicate
            { date: todayStr, anonymousToken: 'visitor-A', timestamp: now - 1000 }, // duplicate
            { date: todayStr, anonymousToken: 'visitor-B', timestamp: now - 2000 }, // distinct
          ],
        },
      };

      const ranking = calculateBusinessRanking(business, { now });
      // Only 2 unique clicks should be counted (visitor-A once + visitor-B once)
      assert.equal(ranking.breakdown.uniqueClicksCount, 2);
      assert.equal(ranking.breakdown.clickPoints, 2);
    });

    test('Consumer-visible badge: tier name and color star are distinct from customer review average', () => {
      const ranking = calculateBusinessRanking({}, {
        overrideApprovedReviewsCount: 4, // 40 pts
        overrideUniqueClicksCount: 35,   // 35 pts
        overrideOwnerActivitiesCount: 5, // 25 pts
      });

      // Distinct styling per tier
      assert.equal(ranking.tier, 'Diamond');
      assert.equal(ranking.badgeText, 'Diamond Rank');
      assert.match(ranking.starColor, /cyan/);
      assert.match(ranking.badgeBg, /cyan/);

      // Verify Gold
      const gold = calculateBusinessRanking({}, { overrideApprovedReviewsCount: 4 });
      assert.equal(gold.tier, 'Gold');
      assert.equal(gold.badgeText, 'Gold Rank');
      assert.match(gold.starColor, /amber/);

      // Verify Platinum
      const plat = calculateBusinessRanking({}, { overrideApprovedReviewsCount: 4, overrideUniqueClicksCount: 20 });
      assert.equal(plat.tier, 'Platinum');
      assert.equal(plat.badgeText, 'Platinum Rank');
      assert.match(plat.starColor, /indigo/);
    });

    test('Ranking is system-calculated and overrides any forged rankingTier in request body', async () => {
      authenticateTestOwner();

      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Barebones New Business',
          category: 'other',
          rankingTier: 'Diamond', // Caller attempts to forge Diamond tier!
        }),
      });

      assert.equal(createRes.status, 200);
      const data = await createRes.json();
      // Barebones profile MUST calculate as Silver, ignoring forged 'Diamond'
      assert.equal(data.business.rankingTier, 'Silver');
    });
  });
});
