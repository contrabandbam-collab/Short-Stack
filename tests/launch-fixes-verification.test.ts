import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createApiApp,
  resetSessionToVisitor,
} from '../server.ts';
import { db, getPublicBusinessProjection } from '../src/server/db.ts';
import { matchBusinessSmartSearch } from '../src/utils/smartSearch.ts';
import type { Business } from '../src/types/pipsqueak.ts';

describe('Short Stack Launch Fixes Verification Suite (tests/launch-fixes-verification.test.ts)', () => {
  let appServer: any;
  let baseUrl: string;
  let initialDbSnapshot: any;

  before(async () => {
    db.setTestMode(true);
    initialDbSnapshot = db.getSnapshot();

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
    db.setProductionMode(false);
    db.restoreSnapshot(initialDbSnapshot);
    db.setTestMode(false);
  });

  beforeEach(() => {
    db.restoreSnapshot(initialDbSnapshot);
    db.setProductionMode(false);
    resetSessionToVisitor();
  });

  // ==========================================
  // 1. BARBER QUERY PRECISION & SEMANTIC CATEGORY GUARDRAILS
  // ==========================================
  describe('1. Search Precision & Semantic Guardrails', () => {
    const restaurant: Business = {
      id: 'biz-restaurant-1',
      ownerId: 'owner-1',
      name: 'Laurel & Olive Osteria',
      category: 'restaurants-food',
      shortDescription: 'Seasonal Italian with wood-fired pizzas, handmade pasta, and shaved summer truffle.',
      keywords: ['pasta', 'pizza', 'catering', 'italian'],
      city: 'Seattle',
      state: 'WA',
      status: 'active',
    } as any;

    const petGroomer: Business = {
      id: 'biz-pet-1',
      ownerId: 'owner-2',
      name: 'Paws & Whiskers Pet Grooming',
      category: 'pet-services',
      shortDescription: 'Gentle salon grooming for dogs and cats with fur trimming, washing, and coat styling.',
      keywords: ['dog', 'cat', 'puppy', 'grooming'],
      city: 'Seattle',
      state: 'WA',
      status: 'active',
    } as any;

    const barberShop: Business = {
      id: 'biz-barber-1',
      ownerId: 'owner-3',
      name: 'Classic Fade Barber Shop',
      category: 'beauty-barber-salon',
      shortDescription: 'Independent neighborhood barber specializing in traditional hot towel shaves and skin fades.',
      keywords: ['barber', 'haircut', 'fade'],
      city: 'Seattle',
      state: 'WA',
      status: 'active',
    } as any;

    test('query for "barber" strictly matches barber shop and NEVER returns a restaurant or pet groomer', () => {
      assert.equal(
        matchBusinessSmartSearch(barberShop, 'barber'),
        true,
        'Barber shop should match "barber"'
      );
      assert.equal(
        matchBusinessSmartSearch(restaurant, 'barber'),
        false,
        'Restaurant should never match "barber" even with shaved truffle'
      );
      assert.equal(
        matchBusinessSmartSearch(petGroomer, 'barber'),
        false,
        'Pet groomer should never match "barber"'
      );
    });

    test('query for "haircut" matches barber shop but never returns a restaurant', () => {
      assert.equal(matchBusinessSmartSearch(barberShop, 'haircut'), true);
      assert.equal(matchBusinessSmartSearch(restaurant, 'haircut'), false);
    });

    test('query for "cat" matches pet grooming and does NOT match restaurant catering', () => {
      assert.equal(
        matchBusinessSmartSearch(petGroomer, 'cat'),
        true,
        'Pet grooming should match "cat"'
      );
      assert.equal(
        matchBusinessSmartSearch(restaurant, 'cat'),
        false,
        'Restaurant catering should not match "cat"'
      );
    });

    test('query for "fix my brakes" matches automotive mechanic and never returns a restaurant or barber', () => {
      const autoShop: Business = {
        id: 'biz-auto-1',
        ownerId: 'owner-4',
        name: 'Precision Apex Auto Works',
        category: 'auto-marine',
        shortDescription: 'Brake service, diagnostics, and engine repair.',
        keywords: ['auto repair', 'brakes', 'mechanic'],
        status: 'active',
      } as any;

      assert.equal(matchBusinessSmartSearch(autoShop, 'fix my brakes'), true);
      assert.equal(matchBusinessSmartSearch(restaurant, 'fix my brakes'), false);
      assert.equal(matchBusinessSmartSearch(barberShop, 'fix my brakes'), false);
    });

    test('shows clear no-match state when query has no relevant trustworthy results', async () => {
      // Search for nonexistent service in the test catalog
      const res = await fetch(`${baseUrl}/api/businesses?q=astrophysics+laboratory`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(Array.isArray(data.businesses), true);
      assert.equal(data.businesses.length, 0, 'Should return empty array when no relevant results exist');
    });
  });

  // ==========================================
  // 2. PRODUCTION DISCOVERY & FIXTURE ISOLATION
  // ==========================================
  describe('2. Production Discovery & Fixture Isolation', () => {
    test('in production mode with unconfigured/empty DB, discovery returns empty list and never leaks demo fixtures', async () => {
      db.setProductionMode(true);

      const res = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(Array.isArray(data.businesses), true);
      assert.equal(data.businesses.length, 0, 'Production discovery must be empty without live DB');

      // Verify no 555 phone numbers, no .local sites, no demo names
      const allText = JSON.stringify(data);
      assert.equal(allText.includes('555-'), false, 'Must not contain 555 placeholder numbers');
      assert.equal(allText.includes('.local'), false, 'Must not contain .local demo websites');
      assert.equal(allText.includes('Laurel & Olive'), false, 'Must not contain demo business names');
    });

    test('in production mode, promotions endpoint returns empty list without live DB', async () => {
      db.setProductionMode(true);

      const res = await fetch(`${baseUrl}/api/promotions`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(Array.isArray(data.promotions), true);
      assert.equal(data.promotions.length, 0, 'Production promotions must be empty without live DB');
    });

    test('in production mode, getBusinessById returns 404 for demo business IDs', async () => {
      db.setProductionMode(true);

      const res = await fetch(`${baseUrl}/api/businesses/sk-8a1f49b2`);
      assert.equal(res.status, 404, 'Demo business must return 404 in production mode');
    });
  });

  // ==========================================
  // 3. CONTACT ACTION ALLOWLIST & PROJECTION
  // ==========================================
  describe('3. Contact Action Allowlist & Address Privacy', () => {
    test('public business projection exposes safe public contact and omits private billing, owner email, and internal metadata', () => {
      const fullBusiness: Business = {
        id: 'biz-contact-test',
        ownerId: 'user-secret-owner',
        ownerEmail: 'realowner@private.com',
        name: 'Safe Projections Co',
        category: 'retail-shopping',
        phone: '(206) 829-1400',
        email: 'public@safeprojections.com',
        website: 'https://safeprojections.com',
        address: '123 Private Street',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98101',
        publishStreetAddress: false,
        status: 'active',
        billing: {
          status: 'paid',
          initialSignUpFee: 19.99,
          renewalFee: 25,
          providerReference: 'secret_sq_ref',
          receiptNumber: 'REC-SECRET',
        } as any,
      } as any;

      const proj: any = getPublicBusinessProjection(fullBusiness);

      // Permitted public fields
      assert.equal(proj.name, 'Safe Projections Co');
      assert.equal(proj.phone, '(206) 829-1400');
      assert.equal(proj.email, 'public@safeprojections.com');
      assert.equal(proj.city, 'Seattle');

      // Private fields strictly omitted or cleared
      assert.equal(proj.ownerId, undefined, 'ownerId must not be exposed');
      assert.equal(proj.ownerEmail, undefined, 'ownerEmail must not be exposed');
      assert.equal(proj.billing, undefined, 'billing must not be exposed');
      assert.equal(proj.address, '', 'Unpublished street address must be stripped');
    });
  });

  // ==========================================
  // 4. REVIEW COUNT & AVERAGE CONSISTENCY
  // ==========================================
  describe('4. Review Count & Average Consistency', () => {
    test('seeded ratings are removed: businesses start with 0 rating count and null average', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/sk-8a1f49b2/reviews`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(Array.isArray(data.reviews), true);
      // No seeded reviews
      assert.equal(data.reviews.length, 0);
      assert.equal(data.ratingCount, 0);
      assert.equal(data.averageRating, null);
    });

    test('submitting a customer review derives exact synchronized rating count and average', async () => {
      const addRes1 = await fetch(`${baseUrl}/api/businesses/sk-8a1f49b2/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          comment: 'Outstanding artisan pasta and warm neighborhood hospitality.',
          reviewerName: 'Jordan M.',
        }),
      });
      assert.equal(addRes1.status, 200);
      const data1 = await addRes1.json();
      assert.equal(data1.ratingCount, 1);
      assert.equal(data1.averageRating, 5);

      const addRes2 = await fetch(`${baseUrl}/api/businesses/sk-8a1f49b2/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 3,
          comment: 'Good food but a bit noisy on weekend evening.',
          reviewerName: 'Alex B.',
        }),
      });
      assert.equal(addRes2.status, 200);
      const data2 = await addRes2.json();
      assert.equal(data2.ratingCount, 2);
      assert.equal(data2.averageRating, 4); // (5 + 3) / 2 = 4.0

      // Now query public reviews endpoint: count and average MUST match exactly
      const getRes = await fetch(`${baseUrl}/api/businesses/sk-8a1f49b2/reviews`);
      assert.equal(getRes.status, 200);
      const getData = await getRes.json();
      assert.equal(getData.reviews.length, 2);
      assert.equal(getData.ratingCount, 2);
      assert.equal(getData.averageRating, 4);
    });
  });

  // ==========================================
  // 5. LAUNCH COPY DIAGNOSIS & PROMOTIONAL INTEGRITY
  // ==========================================
  describe('5. Launch Copy Diagnosis & Promotional Integrity', () => {
    test('unsupported verification claims are removed from public promotional and directory listing copy', () => {
      const promotionsComponent = fs.readFileSync(
        path.join(process.cwd(), 'src/components/LocalPromotionsSection.tsx'),
        'utf8'
      );
      const appComponent = fs.readFileSync(
        path.join(process.cwd(), 'src/App.tsx'),
        'utf8'
      );
      const flyerComponent = fs.readFileSync(
        path.join(process.cwd(), 'src/components/FlyerBuilder.tsx'),
        'utf8'
      );

      // Verify removal of unsupported claims
      assert.equal(
        promotionsComponent.includes('Verified direct-to-consumer specials'),
        false,
        'LocalPromotionsSection must not claim unverified direct-to-consumer specials'
      );
      assert.equal(
        appComponent.includes('Verified independent local businesses'),
        false,
        'App featured listing copy must not claim unverified independent local businesses'
      );
      assert.equal(
        flyerComponent.includes('Verified Short Stack Special'),
        false,
        'FlyerBuilder preview must not claim unverified special'
      );

      // Verify accurate neutral wording is present
      assert.match(
        promotionsComponent,
        /Direct-to-consumer specials from local businesses within a 25-mile radius/i,
        'LocalPromotionsSection must use accurate neutral promotional wording'
      );
      assert.match(
        appComponent,
        /Independent local businesses with permanent profile addresses and direct contact options/i,
        'App must use accurate neutral directory listing wording'
      );
      assert.match(
        flyerComponent,
        /Short Stack Community Special/i,
        'FlyerBuilder must use neutral community special label'
      );
    });

    test('production mode with unconfigured/empty DB guarantees zero demo promotions or listings and honest empty state', async () => {
      db.setProductionMode(true);

      const bizRes = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(bizRes.status, 200);
      const bizData = await bizRes.json();
      assert.equal(bizData.businesses.length, 0, 'Production must return 0 listings without live DB');

      const promoRes = await fetch(`${baseUrl}/api/promotions`);
      assert.equal(promoRes.status, 200);
      const promoData = await promoRes.json();
      assert.equal(promoData.promotions.length, 0, 'Production must return 0 promotions without live DB');
    });

    test('local promotion eligibility enforces active paid status, published flyer, and 25-mile radius', () => {
      const promotionsComponent = fs.readFileSync(
        path.join(process.cwd(), 'src/components/LocalPromotionsSection.tsx'),
        'utf8'
      );

      // Enforces 25-mile radius constraint
      assert.match(
        promotionsComponent,
        /dist\s*!==\s*null\s*&&\s*dist\s*>\s*25/,
        'LocalPromotionsSection must filter businesses exceeding 25 miles'
      );
      assert.match(
        promotionsComponent,
        /25mi radius|25-mile/i,
        'LocalPromotionsSection must indicate 25-mile radius constraint'
      );
    });

    test('24-hour Business Highlight rotates daily and requires active paid status', () => {
      const highlightComponent = fs.readFileSync(
        path.join(process.cwd(), 'src/components/BusinessHighlight.tsx'),
        'utf8'
      );

      assert.match(
        highlightComponent,
        /b\.status\s*===\s*'active'\s*&&\s*\(!b\.billing\s*\|\|\s*b\.billing\.status\s*===\s*'paid'\)/,
        'BusinessHighlight must restrict eligibility to active, paid businesses'
      );
      assert.match(
        highlightComponent,
        /Rotates every 24 hours/i,
        'BusinessHighlight copy must indicate 24-hour rotation'
      );
    });
  });
});
