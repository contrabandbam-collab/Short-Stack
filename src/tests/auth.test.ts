import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiApp,
  createSession,
  clearAllSessions,
  resetSessionToVisitor,
} from '../../server.ts';
import {
  db,
  getPublicBusinessProjection,
  enforceBusinessAddressPrivacy,
} from '../server/db.ts';
import { Business } from '../types/pipsqueak.ts';

describe('Row-Level Security & Access Control Verification (src/tests/auth.test.ts)', () => {
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
    db.restoreSnapshot(initialDbSnapshot);
    db.setTestMode(false);
  });

  beforeEach(() => {
    db.restoreSnapshot(initialDbSnapshot);
    clearAllSessions();
    resetSessionToVisitor();
  });

  // ---------------------------------------------------------------------------
  // 1. Private Address Access Control & Protection
  // ---------------------------------------------------------------------------
  describe('Private Address Access Control', () => {
    test('public / anonymous visitors cannot access home residence address of home-based business', async () => {
      // sk-3f7b88a0 is Timber & Stone Home Craftsmen (home-based, visits denied)
      const res = await fetch(`${baseUrl}/api/businesses/sk-3f7b88a0`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.business.address, '', 'Street address must be stripped in public projection');
      assert.equal(data.business.publishStreetAddress, false);
      assert.equal(data.business.directionsUrl, undefined);
    });

    test('public business list API conceals private address for service-area business', async () => {
      const res = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(res.status, 200);
      const data = await res.json();
      const timber = data.businesses.find((b: any) => b.id === 'sk-3f7b88a0');
      assert.ok(timber, 'Timber & Stone should be in list');
      assert.equal(timber.address, '', 'Public list must not expose private street address');
      assert.equal(timber.publishStreetAddress, false);
    });

    test('non-owner cannot see raw residential address on protected GET endpoint', async () => {
      const strangerSession = createSession({
        id: 'user-stranger',
        name: 'Stranger Owner',
        email: 'stranger@example.com',
        role: 'owner',
      });

      const res = await fetch(`${baseUrl}/api/businesses/sk-3f7b88a0`, {
        headers: { 'x-session-id': strangerSession.id },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.isOwner, false);
      assert.equal(data.business.address, '', 'Non-owner receives public projection without private address');
    });

    test('enforceBusinessAddressPrivacy conceals private address even with conflicting legacy flags', () => {
      const sample: Business = {
        id: 'sk-test-privacy',
        ownerId: 'owner-test',
        ownerEmail: 'owner@test.local',
        name: 'Private Plumbing',
        shortDescription: 'Professional residential plumbing services',
        category: 'home-services',
        keywords: ['plumbing', 'emergency'],
        address: '123 Confidential St',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98103',
        serviceArea: 'King County',
        businessLocationType: 'Home-based',
        homeVisitAllowed: false,
        isServiceAreaOnly: true,
        publishStreetAddress: true, // Conflicting flag
        phone: '206-555-0199',
        email: 'plumbing@test.local',
        website: 'https://example.com',
        photos: [],
        menuPhotos: [],
        menuItems: [],
        services: [],
        hours: {
          monday: '8am-5pm', tuesday: '8am-5pm', wednesday: '8am-5pm',
          thursday: '8am-5pm', friday: '8am-5pm', saturday: 'Closed', sunday: 'Closed',
        },
        status: 'active',
        staff: [],
        billing: {
          status: 'paid',
          isInitialSignUpPaid: true,
          initialSignUpFee: 19.99,
          renewalFee: 25,
          termMonths: 2,
          reminderSent: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const sanitized = enforceBusinessAddressPrivacy(sample);
      assert.equal(sanitized.address, '');
      assert.equal(sanitized.publishStreetAddress, false);
      assert.equal(sanitized.directionsUrl, undefined);

      const projected = getPublicBusinessProjection(sample);
      assert.equal(projected.address, '');
      assert.equal(projected.publishStreetAddress, false);
      assert.equal(projected.directionsUrl, undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Row-Level Modification Authorization (Tenant Isolation)
  // ---------------------------------------------------------------------------
  describe('Row-Level Modification Authorization', () => {
    test('unauthorized user cannot update another owner listing', async () => {
      const attackerSession = createSession({
        id: 'user-attacker',
        name: 'Attacker User',
        email: 'attacker@example.com',
        role: 'owner',
        aal: 'aal2',
      });

      // Target listing sk-2rn7bf7z belongs to user-owner-1
      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': attackerSession.id,
        },
        body: JSON.stringify({
          name: 'Hijacked Bakery Name',
        }),
      });

      assert.equal(res.status, 403, 'Unauthorized modification must be rejected with 403');
      const data = await res.json();
      assert.match(data.error, /permission denied|only the business owner/i);

      // Verify the target listing was NOT modified
      const current = db.getBusinessById('sk-2rn7bf7z');
      assert.equal(current?.name, 'Sound View Artisan Bakery', 'Listing name must remain intact');
    });

    test('unauthorized user cannot archive another owner listing', async () => {
      const attackerSession = createSession({
        id: 'user-attacker',
        name: 'Attacker User',
        email: 'attacker@example.com',
        role: 'owner',
      });

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/archive`, {
        method: 'POST',
        headers: {
          'x-session-id': attackerSession.id,
        },
      });

      assert.equal(res.status, 403);
      const current = db.getBusinessById('sk-2rn7bf7z');
      assert.notEqual(current?.status, 'archived');
    });

    test('unauthorized user cannot publish another owner listing', async () => {
      const attackerSession = createSession({
        id: 'user-attacker',
        name: 'Attacker User',
        email: 'attacker@example.com',
        role: 'owner',
      });

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/publish`, {
        method: 'POST',
        headers: {
          'x-session-id': attackerSession.id,
        },
      });

      assert.equal(res.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Sensitive Listing Data & Role Protection
  // ---------------------------------------------------------------------------
  describe('Sensitive Listing Data & Role Protection', () => {
    test('public projection strictly strips sensitive owner, billing, and audit data', () => {
      const biz = db.getBusinessById('sk-2rn7bf7z');
      assert.ok(biz);
      assert.ok(biz.billing, 'Raw listing has billing data');

      const projected = getPublicBusinessProjection(biz) as any;
      assert.equal(projected.billing, undefined, 'Billing must be omitted from public projection');
      assert.equal(projected.ownerId, undefined, 'ownerId must be omitted from public projection');
      assert.equal(projected.ownerEmail, undefined, 'ownerEmail must be omitted from public projection');
      assert.equal(projected.ein, undefined, 'EIN must be omitted from public projection');
      assert.equal(projected.insuranceDetails, undefined, 'Insurance details must be omitted from public projection');
    });

    test('non-admin user cannot access admin moderation endpoints', async () => {
      const ownerSession = createSession({
        id: 'user-regular-owner',
        name: 'Regular Owner',
        email: 'regowner@example.com',
        role: 'owner',
      });

      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { 'x-session-id': ownerSession.id },
      });
      assert.equal(res.status, 403);
    });

    test('role escalation during self-registration is strictly thwarted', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Escalation Check',
          email: 'escalation-test@example.com',
          password: 'Password123!',
          role: 'admin',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.role, 'visitor', 'Escalation attempt must strictly result in least-privilege visitor role');

      const userInDb = db.getUserByEmail('escalation-test@example.com');
      assert.equal(userInDb?.role, 'visitor');
    });

    test('behavioral: address fields are strictly absent or empty in public list and profile JSON for home-based no-visit and mobile', async () => {
      // 1. Check profile endpoint for home-based no-visit
      const resProfile = await fetch(`${baseUrl}/api/businesses/sk-3f7b88a0`);
      assert.equal(resProfile.status, 200);
      const dataProfile = await resProfile.json();
      assert.equal(dataProfile.business.address, '', 'Profile JSON address must be empty');
      assert.equal(dataProfile.business.publishStreetAddress, false);
      assert.equal(dataProfile.business.directionsUrl, undefined);

      // 2. Check public list endpoint
      const resList = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(resList.status, 200);
      const dataList = await resList.json();
      const timber = dataList.businesses.find((b: any) => b.id === 'sk-3f7b88a0');
      assert.ok(timber);
      assert.equal(timber.address, '', 'List JSON address must be empty for home-based no-visit');
      assert.equal(timber.publishStreetAddress, false);
      assert.equal(timber.directionsUrl, undefined);

      // 3. Confirm brick-and-mortar retains public street address
      const soundView = dataList.businesses.find((b: any) => b.id === 'sk-2rn7bf7z');
      assert.ok(soundView);
      assert.ok(soundView.address.length > 0, 'Storefront retains street address');
      assert.equal(soundView.publishStreetAddress, true);
    });

    test('session isolation: concurrent distinct sessions cannot access each other privileged actions', async () => {
      const owner1 = createSession({
        id: 'user-owner-1',
        name: 'Owner 1',
        email: 'owner1@test.local',
        role: 'owner',
      });
      const owner2 = createSession({
        id: 'user-owner-2',
        name: 'Owner 2',
        email: 'owner2@test.local',
        role: 'owner',
      });

      // Concurrent updates targeting listings owned by the other
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': owner2.id, // owner2 trying to update owner1's listing
          },
          body: JSON.stringify({ name: 'Tampered By Owner 2' }),
        }),
        fetch(`${baseUrl}/api/businesses/sk-3f7b88a0`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': owner1.id, // owner1 trying to update owner2's listing
          },
          body: JSON.stringify({ name: 'Tampered By Owner 1' }),
        }),
      ]);

      assert.equal(res1.status, 403);
      assert.equal(res2.status, 403);
    });

    test('durable session store fails closed on privileged routes when unconfigured', async () => {
      process.env.SESSION_STORE_UNCONFIGURED = 'true';
      try {
        const adminSession = createSession({
          id: 'admin-sess-check',
          name: 'Admin User',
          email: 'admin@seeker.local',
          role: 'admin',
        });

        const res = await fetch(`${baseUrl}/api/categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': adminSession.id,
          },
          body: JSON.stringify({
            id: 'cat-sess-test',
            name: 'Session Test Category',
            description: 'Test',
          }),
        });

        assert.equal(res.status, 503);
        const data = await res.json();
        assert.match(data.error, /Durable shared session store is not configured/i);
        assert.ok(data.setupRequired);
      } finally {
        delete process.env.SESSION_STORE_UNCONFIGURED;
      }
    });
  });
});
