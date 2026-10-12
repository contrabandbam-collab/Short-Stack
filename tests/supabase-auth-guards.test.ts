import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiApp,
  createSession,
  clearAllSessions,
  resetSessionToVisitor,
  INACTIVITY_TIMEOUT_MS,
} from '../server.ts';
import { db } from '../src/server/db.ts';
import { Business } from '../src/types/pipsqueak.ts';

describe('Supabase Auth & Protected Routes Suite (tests/supabase-auth-guards.test.ts)', () => {
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
    delete process.env.AUTH_UNCONFIGURED;
    delete process.env.SUPABASE_UNCONFIGURED;
  });

  // ---------------------------------------------------------------------------
  // 1. Public Consumer Access (Search, Profiles, Listings, Promotions)
  // ---------------------------------------------------------------------------
  describe('1. Public Consumer Access Without Account', () => {
    test('public search returns active listings with 200 OK without any auth token', async () => {
      const res = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.businesses));
      assert.ok(data.businesses.length > 0);
      for (const biz of data.businesses) {
        assert.equal(biz.status, 'active');
        assert.equal(biz.billing, undefined, 'Sensitive billing info stripped');
        assert.equal(biz.ownerId, undefined, 'Private owner ID stripped');
        assert.equal(biz.ownerEmail, undefined, 'Private owner email stripped');
      }
    });

    test('public category listing returns 200 OK without any auth token', async () => {
      const res = await fetch(`${baseUrl}/api/categories`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.categories));
      assert.ok(data.categories.length > 0);
    });

    test('public business profile returns 200 OK for active business without any account', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.business);
      assert.equal(data.business.id, 'sk-2rn7bf7z');
      assert.equal(data.isOwner, false);
      assert.equal(data.isAdmin, false);
      assert.equal(data.business.billing, undefined);
    });

    test('public promotions endpoint returns published promotional flyers without auth', async () => {
      const res = await fetch(`${baseUrl}/api/promotions`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.promotions));
    });

    test('public reviews endpoint returns 200 OK for published reviews without an account', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/reviews`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.reviews));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. 401 Unauthorized Enforcement & Session Validation
  // ---------------------------------------------------------------------------
  describe('2. 401 Unauthorized Enforcement & Token Verification', () => {
    test('unauthenticated request to owner-only listings returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /unauthorized|sign-in required/i);
    });

    test('unauthenticated request to create business returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Unauthorized Business',
          category: 'restaurants-food',
        }),
      });
      assert.equal(res.status, 401);
    });

    test('invalid or garbage Bearer token returns 401 Unauthorized on protected routes', async () => {
      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-garbage-token-xyz',
        },
        body: JSON.stringify({
          headline: 'Special Deal',
          offerDetails: '20% off',
        }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /unauthorized|valid supabase authentication token required/i);
    });

    test('session expired after 10-minute inactivity returns 401 with sessionExpired flag', async () => {
      const expiredSession = createSession(
        {
          id: 'user-owner-1',
          name: 'Expired Owner',
          email: 'owner1@test.local',
          role: 'owner',
          aal: 'aal2',
        },
        Date.now() - (INACTIVITY_TIMEOUT_MS + 5000)
      );

      const res = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`, {
        headers: {
          'x-session-id': expiredSession.id,
        },
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.sessionExpired, true);
      assert.match(data.error, /10 minutes of inactivity/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Cross-Business Isolation & Owner Isolation (403 Forbidden)
  // ---------------------------------------------------------------------------
  describe('3. Cross-Business Isolation & Owner Protections', () => {
    test('authenticated owner cannot update a business owned by another user (returns 403)', async () => {
      // Mock token for owner 2 (email: owner2@test.local, uid: user-owner-2) with AAL2
      const owner2Token = 'mock-supabase-owner-user-owner-2-owner2@test.local-aal2';

      // Attempt to modify sk-2rn7bf7z (which belongs to user-owner-1)
      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner2Token}`,
        },
        body: JSON.stringify({
          name: 'Hijacked Business Name',
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /permission denied|access denied/i);

      // Verify business data is completely intact
      const original = db.getBusinessById('sk-2rn7bf7z');
      assert.equal(original?.name, 'Sound View Artisan Bakery');
    });

    test('authenticated owner cannot archive a business owned by another user (returns 403)', async () => {
      const owner2Token = 'mock-supabase-owner-user-owner-2-owner2@test.local-aal2';

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/archive`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${owner2Token}`,
        },
      });

      assert.equal(res.status, 403);
      const current = db.getBusinessById('sk-2rn7bf7z');
      assert.notEqual(current?.status, 'archived');
    });

    test('authenticated owner cannot edit promotional flyer of another user listing (returns 403)', async () => {
      const owner2Token = 'mock-supabase-owner-user-owner-2-owner2@test.local-aal2';

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner2Token}`,
        },
        body: JSON.stringify({
          headline: 'Malicious Flyer',
          offerDetails: 'Free items',
        }),
      });

      assert.equal(res.status, 403);
    });

    test('authenticated owner cannot invite staff to another owner business listing (returns 403)', async () => {
      const owner2Token = 'mock-supabase-owner-user-owner-2-owner2@test.local-aal2';

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner2Token}`,
        },
        body: JSON.stringify({
          email: 'infiltrator@test.local',
          permissions: ['edit_profile'],
        }),
      });

      assert.equal(res.status, 403);
      const b = db.getBusinessById('sk-2rn7bf7z');
      assert.ok(!b?.staff?.some((s) => s.email === 'infiltrator@test.local'));
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Staff Assignment & Authorization
  // ---------------------------------------------------------------------------
  describe('4. Staff Assignment & Scope Enforcement', () => {
    test('assigned staff member can edit assigned business flyer with edit_flyer permission', async () => {
      // First invite staff member as business owner (user-owner-1)
      const ownerToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal2';
      const staffEmail = 'assignedstaff@test.local';

      const inviteRes = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          email: staffEmail,
          name: 'Jane Staff',
          permissions: ['edit_flyer', 'edit_profile'],
        }),
      });
      assert.equal(inviteRes.status, 200);

      // Now staff member signs in with token for assignedstaff@test.local
      const staffToken = `mock-supabase-staff-user-staff-1-email:${staffEmail}-aal2`;

      const flyerRes = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          headline: 'Fresh Morning Pastries',
          offerDetails: 'Buy 1 get 1 free before 10am',
          publish: true,
        }),
      });

      assert.equal(flyerRes.status, 200);
      const flyerData = await flyerRes.json();
      assert.equal(flyerData.flyer.headline, 'Fresh Morning Pastries');
    });

    test('assigned staff member CANNOT invite or remove other staff members (returns 403)', async () => {
      const staffEmail = 'assignedstaff@test.local';
      const staffToken = `mock-supabase-staff-user-staff-1-email:${staffEmail}-aal2`;

      // Attempt to invite another staff member
      const inviteRes = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          email: 'subordinate@test.local',
          permissions: ['edit_profile'],
        }),
      });

      assert.equal(inviteRes.status, 403);
      const data = await inviteRes.json();
      assert.match(data.error, /only the business owner can invite staff/i);
    });

    test('staff member cannot edit businesses they are not assigned to (returns 403)', async () => {
      const staffEmail = 'assignedstaff@test.local';
      const staffToken = `mock-supabase-staff-user-staff-1-email:${staffEmail}-aal2`;

      // Try to edit sk-3f7b88a0 (which staff is NOT assigned to)
      const res = await fetch(`${baseUrl}/api/businesses/sk-3f7b88a0`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized Staff Edit',
        }),
      });

      assert.equal(res.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Admin Denial & Role Spoofing Prevention
  // ---------------------------------------------------------------------------
  describe('5. Admin Route Denial & Role Trust', () => {
    test('regular owner cannot access administrator endpoints (returns 403)', async () => {
      const ownerToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal2';

      const endpoints = [
        `${baseUrl}/api/admin/users`,
        `${baseUrl}/api/admin/promotions`,
        `${baseUrl}/api/admin/reviews`,
        `${baseUrl}/api/moderation/actions`,
        `${baseUrl}/api/moderation/reports`,
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        assert.equal(res.status, 403, `Endpoint ${endpoint} must return 403 for non-admin`);
      }
    });

    test('client cannot self-assign admin role via request body or client token claims', async () => {
      // Attacker sends token claiming admin role, but email is not an authorized administrator
      const spoofToken = 'mock-supabase-admin-user-attacker-email:attacker@example.com-aal2';

      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${spoofToken}` },
      });

      assert.ok([401, 403].includes(res.status), 'Spoofed admin claim must be rejected because email is not in trusted ADMIN_EMAILS');
    });

    test('verified admin in trusted ADMIN_EMAILS can access admin console with AAL2', async () => {
      const adminToken = 'mock-supabase-admin-user-admin-1-email:admin@seeker.local-aal2';

      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.users));
    });

    test('new account role strictly defaults to least-privilege visitor with no signup path to owner/staff/admin', async () => {
      const newVisitorToken = 'mock-supabase-visitor-user-new-999-email:brandnewuser@example.com-aal1';

      // 1. Verify token endpoint issues visitor role
      const res = await fetch(`${baseUrl}/api/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: newVisitorToken }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.role, 'visitor', 'New account MUST strictly default to visitor role');

      // 2. Visitor cannot access private owner listings
      const ownRes = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`, {
        headers: { Authorization: `Bearer ${newVisitorToken}` },
      });
      assert.equal(ownRes.status, 401);

      // 3. Visitor cannot create business listings
      const createRes = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newVisitorToken}`,
        },
        body: JSON.stringify({
          name: 'Visitor Attempt Business',
          category: 'restaurants-food',
        }),
      });
      assert.equal(createRes.status, 401);
    });

    test('admin can elevate user role and non-admin cannot elevate roles', async () => {
      const adminToken = 'mock-supabase-admin-user-admin-1-email:admin@seeker.local-aal2';
      const nonAdminToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal2';

      // Save a visitor account
      const testVisitor = db.saveUser({
        id: 'user-to-elevate-1',
        name: 'Prospective Owner',
        email: 'prospect@example.com',
        role: 'visitor',
        createdAt: new Date().toISOString(),
      });

      // Non-admin attempting to elevate returns 403
      const unauthorizedRes = await fetch(`${baseUrl}/api/admin/users/${testVisitor.id}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${nonAdminToken}`,
        },
        body: JSON.stringify({ role: 'owner' }),
      });
      assert.equal(unauthorizedRes.status, 403);

      // Admin elevates role to owner
      const adminRes = await fetch(`${baseUrl}/api/admin/users/${testVisitor.id}/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ role: 'owner' }),
      });
      assert.equal(adminRes.status, 200);
      const elevatedData = await adminRes.json();
      assert.equal(elevatedData.user.role, 'owner');

      const updatedUser = db.getUserById(testVisitor.id);
      assert.equal(updatedUser?.role, 'owner');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Fail-Closed When Supabase Is Misconfigured
  // ---------------------------------------------------------------------------
  describe('6. Fail-Closed When Supabase Is Misconfigured', () => {
    test('protected routes fail closed with 503 when Supabase is unconfigured', async () => {
      process.env.SUPABASE_UNCONFIGURED = 'true';
      try {
        const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/flyer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-supabase-owner-user-owner-1-owner1@test.local-aal2',
          },
          body: JSON.stringify({
            headline: 'Test Headline',
            offerDetails: 'Test Offer',
          }),
        });

        assert.equal(res.status, 503);
        const data = await res.json();
        assert.match(data.error, /Supabase Auth is not configured/i);
        assert.ok(data.setupRequired, 'Must return setup guidance without leaking secret values');
        assert.match(data.setupRequired, /SUPABASE_URL/i);
      } finally {
        delete process.env.SUPABASE_UNCONFIGURED;
      }
    });

    test('token verification endpoint fails closed with 503 when Supabase is unconfigured', async () => {
      process.env.SUPABASE_UNCONFIGURED = 'true';
      try {
        const res = await fetch(`${baseUrl}/api/auth/verify-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: 'any-token' }),
        });

        assert.equal(res.status, 503);
        const data = await res.json();
        assert.match(data.error, /Supabase Auth is not configured/i);
      } finally {
        delete process.env.SUPABASE_UNCONFIGURED;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Supabase MFA / AAL2 Enforcement
  // ---------------------------------------------------------------------------
  describe('7. Supabase MFA (AAL2) Enforcement for Privileged Areas', () => {
    test('single-factor AAL1 token is rejected with 403 MFA_REQUIRED on privileged operations', async () => {
      // Owner token with AAL1 (single-factor password only)
      const singleFactorToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal1';

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${singleFactorToken}`,
        },
        body: JSON.stringify({
          headline: 'MFA Test Headline',
          offerDetails: 'MFA Test Offer',
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.error, 'MFA_REQUIRED');
      assert.equal(data.currentAal, 'aal1');
      assert.equal(data.requiredAal, 'aal2');
    });

    test('two-factor AAL2 token succeeds on privileged operations', async () => {
      // Owner token with AAL2 (TOTP verified)
      const mfaVerifiedToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal2';

      const res = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/flyer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mfaVerifiedToken}`,
        },
        body: JSON.stringify({
          headline: 'AAL2 Verified Deal',
          offerDetails: '15% discount for neighborhood locals',
          publish: true,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.flyer.headline, 'AAL2 Verified Deal');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Review Immutability Except Allowed Flagging & Raw-Table Denial
  // ---------------------------------------------------------------------------
  describe('8. Review Immutability & Raw-Table Private Field Absence', () => {
    let testReviewId: string;

    beforeEach(async () => {
      // Create a fresh review for Sound View Bakery (sk-2rn7bf7z, owned by user-owner-1)
      const addRes = await fetch(`${baseUrl}/api/businesses/sk-2rn7bf7z/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 5,
          comment: 'Outstanding artisan loaves and pain au chocolat.',
          reviewerName: 'Elena Rostova',
        }),
      });
      assert.equal(addRes.status, 200);
      const addData = await addRes.json();
      testReviewId = addData.review.id;
    });

    test('business owner can flag a customer review for admin investigation', async () => {
      const ownerToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal2';
      const res = await fetch(`${baseUrl}/api/reviews/${testReviewId}/flag`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({
          reason: 'Suspected competitor spam review',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.match(data.message, /flagged for administrator investigation/i);

      // Verify in db that review rating and reviewer name remain completely intact
      const rev = db.getReviews(undefined, true).find((r) => r.id === testReviewId);
      assert.ok(rev);
      assert.equal(rev.flaggedByOwner, true);
      assert.equal(rev.flagReason, 'Suspected competitor spam review');
      assert.equal(rev.rating, 5, 'Rating must remain completely unmodified');
      assert.equal(rev.reviewerName, 'Elena Rostova', 'Reviewer identity must remain unmodified');
    });

    test('owner CANNOT change review rating or publication status (immutable to non-admins)', async () => {
      const ownerToken = 'mock-supabase-owner-user-owner-1-owner1@test.local-aal2';

      // Attempting to change status via admin endpoint returns 403
      const resAdmin = await fetch(`${baseUrl}/api/admin/reviews/${testReviewId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ status: 'hidden', adminNotes: 'Owner attempt to hide review' }),
      });
      assert.equal(resAdmin.status, 403, 'Owner cannot alter review status via admin endpoint');

      // Attempting to PUT or PATCH to reviews returns 404 (no mutable route exists)
      const resPut = await fetch(`${baseUrl}/api/reviews/${testReviewId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ rating: 1, comment: 'Overridden review' }),
      });
      assert.equal(resPut.status, 404, 'Direct review modification route must not exist');
    });

    test('verified admin can moderate reviews (change status to hidden)', async () => {
      const adminToken = 'mock-supabase-admin-user-admin-1-email:admin@seeker.local-aal2';

      const res = await fetch(`${baseUrl}/api/admin/reviews/${testReviewId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: 'hidden', adminNotes: 'Confirmed abusive spam' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      const rev = db.getReviews(undefined, true).find((r) => r.id === testReviewId);
      assert.equal(rev?.status, 'hidden');
    });

    test('anonymous requests to public directory strictly exclude raw private fields', async () => {
      const res = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.businesses));
      for (const b of data.businesses) {
        // Sensitive administrative and private fields must NEVER appear in public response
        assert.equal(b.billing, undefined, 'Raw billing must not be exposed');
        assert.equal(b.ownerId, undefined, 'ownerId must not be exposed');
        assert.equal(b.ownerEmail, undefined, 'ownerEmail must not be exposed');
        assert.equal(b.staff, undefined, 'staff roster must not be exposed');
        assert.equal(b.moderationActions, undefined);
      }
    });
  });
});
