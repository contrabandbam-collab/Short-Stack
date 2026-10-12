import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/server/db.ts';
import {
  createApiApp,
  currentUser,
  lastActivityTimestamp,
  resetSessionToVisitor,
  setSessionUser,
  setLastActivityTimestamp,
  checkAndRevokeInactivity,
  INACTIVITY_TIMEOUT_MS,
} from '../server.ts';
import type { Server } from 'node:http';

describe('v2.6 Prelaunch Security & Payment Verification Suite', () => {
  let appServer: Server;
  let baseUrl: string;
  let initialDbSnapshot: any;
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof globalThis.fetch;

  before(async () => {
    // Enable read-only test mode for database to prevent disk mutations
    db.setTestMode(true);
    initialDbSnapshot = db.getSnapshot();
    originalEnv = { ...process.env };
    originalFetch = globalThis.fetch;

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
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    db.restoreSnapshot(initialDbSnapshot);
    db.setTestMode(false);
  });

  beforeEach(() => {
    // Restore clean in-memory database snapshot and visitor session before each test
    db.restoreSnapshot(initialDbSnapshot);
    resetSessionToVisitor();
    process.env = { ...originalEnv };
    // Set standard mock Square test configuration
    process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-test-app-id';
    process.env.SQUARE_LOCATION_ID = 'TEST_LOC_123';
    process.env.SQUARE_ACCESS_TOKEN = 'EAAA_TEST_ACCESS_TOKEN';
    process.env.SQUARE_ENVIRONMENT = 'sandbox';
    process.env.SQUARE_LIVE_PAYMENTS_ENABLED = 'false';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ==========================================
  // 1. INACTIVITY TIMEOUT & BOUNDARY TESTS
  // ==========================================
  describe('10-Minute Inactivity Session Timeout', () => {
    test('timeout constant is exactly 600,000 ms (10 minutes)', () => {
      assert.equal(INACTIVITY_TIMEOUT_MS, 600000);
    });

    test('boundary: session remains ACTIVE just before 10-minute inactivity threshold (595,000 ms)', async () => {
      setSessionUser({
        id: 'user-test-owner',
        email: 'owner@test.local',
        name: 'Test Owner',
        role: 'owner',
      });
      // Fast-forward last activity by 595,000 ms (just before 600,000 ms limit)
      const now = Date.now();
      setLastActivityTimestamp(now - 595000);

      const res = await fetch(`${baseUrl}/api/auth/current`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.role, 'owner');
      assert.equal(data.user.email, 'owner@test.local');
      assert.equal(data.sessionExpired, undefined);
    });

    test('boundary: session EXPIRES and is REVOKED at exactly 600,000 ms of inactivity', async () => {
      setSessionUser({
        id: 'user-test-owner',
        email: 'owner@test.local',
        name: 'Test Owner',
        role: 'owner',
      });
      // Fast-forward last activity by exactly 600,000 ms
      const now = Date.now();
      setLastActivityTimestamp(now - 600000);

      const res = await fetch(`${baseUrl}/api/auth/current`);
      assert.equal(res.status, 200);
      const data = await res.json();
      // User must be reverted to visitor and sessionExpired flagged
      assert.equal(data.user.role, 'visitor');
      assert.equal(data.sessionExpired, true);
    });

    test('boundary: session EXPIRES and protected endpoints return 401 when > 600,000 ms', async () => {
      setSessionUser({
        id: 'user-test-owner',
        email: 'owner@test.local',
        name: 'Test Owner',
        role: 'owner',
      });
      setLastActivityTimestamp(Date.now() - 600050);

      const res = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`);
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.sessionExpired, true);
      assert.match(data.error, /10 minutes of inactivity/);
    });

    test('logging in resets activity timestamp and restores active session', async () => {
      db.saveUser({
        id: 'user-test-owner',
        name: 'Test Owner',
        email: 'owner@test.local',
        role: 'owner',
        createdAt: new Date().toISOString(),
      });

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@test.local', password: 'ValidPassword123!' }),
      });
      assert.equal(loginRes.status, 200);
      const loginData = await loginRes.json();
      assert.equal(loginData.user.role, 'owner');

      const currentRes = await fetch(`${baseUrl}/api/auth/current`);
      assert.equal(currentRes.status, 200);
      const currentData = await currentRes.json();
      assert.equal(currentData.user.role, 'owner');
    });
  });

  // ==========================================
  // 2. PAYMENT IMPLEMENTATION & SQUARE GATEWAY TESTS
  // ==========================================
  describe('Square Payment Integration & Gateway Enforcement', () => {
    // Helper to setup an owner session for Sound View Bakery (sk-2rn7bf7z)
    function setupSoundViewOwner() {
      const b = db.getBusinessById('sk-2rn7bf7z');
      assert.ok(b, 'Sound View Artisan Bakery must exist in test DB');
      setSessionUser({
        id: b.ownerId,
        email: b.ownerEmail,
        name: 'Sound View Owner',
        role: 'owner',
      });
      return b;
    }

    test('Square Success ($19.99 initial): COMPLETED status applies 60-day term & idempotency ledger', async () => {
      const b = setupSoundViewOwner();
      // Ensure initial sign up is unpaid
      b.billing.isInitialSignUpPaid = false;
      b.billing.status = 'unpaid';

      const mockSquarePaymentId = `sq_pay_success_${Date.now()}`;
      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          const reqBody = JSON.parse(options.body);
          assert.equal(reqBody.amount_money.amount, 1999);
          assert.equal(reqBody.amount_money.currency, 'USD');
          assert.equal(reqBody.location_id, 'TEST_LOC_123');
          return new Response(
            JSON.stringify({
              payment: {
                id: mockSquarePaymentId,
                status: 'COMPLETED',
                amount_money: { amount: 1999, currency: 'USD' },
                location_id: 'TEST_LOC_123',
                receipt_number: 'REC-SQ-001',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-nonce-ok',
          idempotencyKey: 'idem-test-key-1',
        }),
      });

      assert.equal(res.status, 200);
      const resData = await res.json();
      assert.equal(resData.success, true);
      assert.equal(resData.business.billing.status, 'paid');
      assert.equal(resData.business.billing.isInitialSignUpPaid, true);
      assert.equal(resData.business.billing.providerReference, mockSquarePaymentId);

      // Verify idempotency ledger recorded the payment
      assert.equal(db.isPaymentEventProcessed(mockSquarePaymentId), true);
      assert.equal(db.isPaymentEventProcessed('idem-test-key-1'), true);
    });

    test('Square Success ($25 renewal): COMPLETED status applies 60-day renewal extension', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = true;
      b.billing.hasReferralDiscount = false;

      const mockSquarePaymentId = `sq_pay_renew_${Date.now()}`;
      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          const reqBody = JSON.parse(options.body);
          assert.equal(reqBody.amount_money.amount, 2500); // $25.00
          assert.equal(reqBody.amount_money.currency, 'USD');
          return new Response(
            JSON.stringify({
              payment: {
                id: mockSquarePaymentId,
                status: 'COMPLETED',
                amount_money: { amount: 2500, currency: 'USD' },
                location_id: 'TEST_LOC_123',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-nonce-renew',
        }),
      });

      assert.equal(res.status, 200);
      const resData = await res.json();
      assert.equal(resData.success, true);
      assert.equal(resData.business.billing.status, 'paid');
      assert.equal(resData.business.billing.providerReference, mockSquarePaymentId);
    });

    test('Square Decline: Card decline returns 400 and preserves unpaid listing state', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = false;
      b.billing.status = 'unpaid';

      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          return new Response(
            JSON.stringify({
              errors: [
                {
                  code: 'CARD_DECLINED',
                  detail: 'Card issuer declined the transaction.',
                  category: 'PAYMENT_METHOD_ERROR',
                },
              ],
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-declined',
        }),
      });

      assert.equal(res.status, 400);
      const errData = await res.json();
      assert.match(errData.error, /declined/i);

      // Business billing must remain unpaid
      const freshBiz = db.getBusinessById(b.id);
      assert.equal(freshBiz?.billing.isInitialSignUpPaid, false);
      assert.equal(freshBiz?.billing.status, 'unpaid');
    });

    test('Square Pending: PENDING status is rejected (not COMPLETED)', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = false;
      b.billing.status = 'unpaid';

      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          return new Response(
            JSON.stringify({
              payment: {
                id: 'sq_pay_pending_1',
                status: 'PENDING',
                amount_money: { amount: 1999, currency: 'USD' },
                location_id: 'TEST_LOC_123',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-pending',
        }),
      });

      assert.equal(res.status, 400);
      const errData = await res.json();
      assert.match(errData.error, /Square payment was not completed.*PENDING/);

      const freshBiz = db.getBusinessById(b.id);
      assert.equal(freshBiz?.billing.isInitialSignUpPaid, false);
    });

    test('Square Wrong Amount: Amount mismatch is rejected', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = false;

      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          return new Response(
            JSON.stringify({
              payment: {
                id: 'sq_pay_wrong_amt',
                status: 'COMPLETED',
                amount_money: { amount: 500, currency: 'USD' }, // 500 instead of 1999
                location_id: 'TEST_LOC_123',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-wrong-amount',
        }),
      });

      assert.equal(res.status, 400);
      const errData = await res.json();
      assert.match(errData.error, /amount or currency verification mismatch/i);
    });

    test('Square Wrong Currency: Non-USD currency is rejected', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = false;

      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          return new Response(
            JSON.stringify({
              payment: {
                id: 'sq_pay_wrong_curr',
                status: 'COMPLETED',
                amount_money: { amount: 1999, currency: 'EUR' },
                location_id: 'TEST_LOC_123',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-wrong-currency',
        }),
      });

      assert.equal(res.status, 400);
      const errData = await res.json();
      assert.match(errData.error, /amount or currency verification mismatch/i);
    });

    test('Square Wrong Location: Location ID mismatch is rejected', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = false;

      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          return new Response(
            JSON.stringify({
              payment: {
                id: 'sq_pay_wrong_loc',
                status: 'COMPLETED',
                amount_money: { amount: 1999, currency: 'USD' },
                location_id: 'DIFFERENT_UNAUTHORIZED_LOCATION',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-wrong-location',
        }),
      });

      assert.equal(res.status, 400);
      const errData = await res.json();
      assert.match(errData.error, /location verification mismatch/i);
    });

    test('Unauthorized Owner: Non-owner cannot initiate payment', async () => {
      const b = db.getBusinessById('sk-2rn7bf7z');
      assert.ok(b);

      // Caller is a different owner
      setSessionUser({
        id: 'user-impostor-999',
        email: 'impostor@test.local',
        name: 'Impostor',
        role: 'owner',
      });

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:some-card',
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Only the verified business owner can initiate payment/i);
    });

    test('Duplicate Payment: Already processed idempotency key is rejected with 409', async () => {
      const b = setupSoundViewOwner();
      db.recordPaymentEvent('idem-already-used-key', b.id, 19.99);

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:some-card',
          idempotencyKey: 'idem-already-used-key',
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.match(data.error, /already been processed/i);
    });

    test('Duplicate Payment: Already processed Square Payment ID is rejected with 409', async () => {
      const b = setupSoundViewOwner();
      b.billing.isInitialSignUpPaid = false;
      const existingSquarePayId = 'sq_pay_already_credited_123';
      db.recordPaymentEvent(existingSquarePayId, b.id, 19.99);

      globalThis.fetch = async (url: any, options: any) => {
        if (typeof url === 'string' && url.includes('/v2/payments')) {
          return new Response(
            JSON.stringify({
              payment: {
                id: existingSquarePayId,
                status: 'COMPLETED',
                amount_money: { amount: 1999, currency: 'USD' },
                location_id: 'TEST_LOC_123',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url, options);
      };

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:card-duplicate-id',
          idempotencyKey: 'fresh-key-but-same-payment-id',
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.match(data.error, /already been credited/i);
    });

    test('Production Live Mode Default OFF: SQUARE_ENVIRONMENT=production without SQUARE_LIVE_PAYMENTS_ENABLED=true is hard-blocked', async () => {
      const b = setupSoundViewOwner();
      process.env.SQUARE_ENVIRONMENT = 'production';
      process.env.SQUARE_LIVE_PAYMENTS_ENABLED = 'false';

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:live-card',
        }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /hard-blocked by default release safety gates/i);
    });

    test('Missing / Invalid Config Fails Closed: Missing credentials return 503', async () => {
      const b = setupSoundViewOwner();
      delete process.env.SQUARE_ACCESS_TOKEN; // Remove secret

      const res = await fetch(`${baseUrl}/api/billing/process-square-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId: b.id,
          sourceId: 'cnon:any-card',
        }),
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.match(data.error, /Square payment gateway is not configured/i);
    });
  });
});
