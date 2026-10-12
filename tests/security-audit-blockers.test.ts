import { describe, test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiApp,
  createSession,
  getSession,
  destroySession,
  sessionStore,
  clearAllSessions,
  setSessionUser,
  setLastActivityTimestamp,
  getTrustedRoleForUser,
  isAuthProviderConfigured,
  resetSessionToVisitor,
  INACTIVITY_TIMEOUT_MS,
  VISITOR_USER,
} from '../server.ts';
import {
  db,
  getPublicBusinessProjection,
  enforceBusinessAddressPrivacy,
} from '../src/server/db.ts';
import { Business } from '../src/types/pipsqueak.ts';

describe('Security Audit Launch Blockers Verification Suite', () => {
  let appServer: any;
  let baseUrl: string;
  let initialDbSnapshot: any;
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof globalThis.fetch;

  before(async () => {
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
    db.restoreSnapshot(initialDbSnapshot);
    clearAllSessions();
    resetSessionToVisitor();
    delete process.env.AUTH_UNCONFIGURED;
    delete process.env.SUPABASE_UNCONFIGURED;
    delete process.env.DATABASE_UNCONFIGURED;
    delete process.env.SESSION_STORE_UNCONFIGURED;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // 1. REAL AUTHENTICATION & AUTHORIZATION TESTS
  // =========================================================================
  describe('1. Real Authentication & Authorization', () => {
    test('rejects email-only login attempt without password', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'owner@test.local' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Password is required/i);
    });

    test('rejects login with incorrect password for existing user', async () => {
      db.saveUser({
        id: 'user-auth-check',
        name: 'Auth Test Owner',
        email: 'authcheck@test.local',
        role: 'owner',
        createdAt: new Date().toISOString(),
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'authcheck@test.local', password: 'WrongPassword999!' }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Invalid email or password/i);
    });

    test('rejects login for nonexistent user', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@test.local', password: 'SomePassword123!' }),
      });
      assert.equal(res.status, 401);
    });

    test('fails closed with 503 and reports required setup when auth provider is unconfigured', async () => {
      process.env.AUTH_UNCONFIGURED = 'true';
      try {
        assert.equal(isAuthProviderConfigured(), false);

        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'owner@test.local', password: 'AnyPassword123!' }),
        });
        assert.equal(res.status, 503);
        const data = await res.json();
        assert.match(data.error, /Authentication provider is not configured/i);
        assert.ok(data.setupRequired, 'Must return setupRequired instructions');
      } finally {
        delete process.env.AUTH_UNCONFIGURED;
      }
    });

    test('trusted role assignment: only emails in ADMIN_EMAILS receive admin role', () => {
      process.env.ADMIN_EMAILS = 'admin@seeker.local,trusted-admin@domain.com';

      // Legitimate admin in list
      const role1 = getTrustedRoleForUser('admin@seeker.local');
      assert.equal(role1, 'admin');

      const role2 = getTrustedRoleForUser('trusted-admin@domain.com');
      assert.equal(role2, 'admin');

      // Email containing "admin" but not in whitelist
      const fakeAdmin = getTrustedRoleForUser('admin-imposter@gmail.com');
      assert.equal(fakeAdmin, 'visitor');

      const fakeAdmin2 = getTrustedRoleForUser('fakeadmin@shortstack.local');
      assert.equal(fakeAdmin2, 'visitor');
    });

    test('self-registration strictly enforces least-privilege visitor role and rejects spoofed admin role', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Hacker Joe',
          email: 'joe-hacker@test.local',
          password: 'SecurePassword123!',
          role: 'admin', // Attempting to escalate privilege in payload
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.role, 'visitor', 'Self-registered user MUST strictly default to visitor, never admin or owner');

      const storedUser = db.getUserByEmail('joe-hacker@test.local');
      assert.ok(storedUser);
      assert.equal(storedUser.role, 'visitor');
    });
  });

  // =========================================================================
  // 2. ISOLATED SESSIONS TESTS
  // =========================================================================
  describe('2. Isolated Sessions & Per-Request Principal Resolution', () => {
    test('distinct sessions maintain complete isolation across concurrent requests', async () => {
      db.saveUser({
        id: 'user-alice-1',
        name: 'Alice Owner',
        email: 'alice@test.local',
        role: 'owner',
        createdAt: new Date().toISOString(),
      });
      db.saveUser({
        id: 'user-bob-2',
        name: 'Bob Owner',
        email: 'bob@test.local',
        role: 'owner',
        createdAt: new Date().toISOString(),
      });

      // Login Alice
      const resA = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@test.local', password: 'Pass12345!' }),
      });
      assert.equal(resA.status, 200);
      const dataA = await resA.json();
      const sessionAId = dataA.sessionId;

      // Login Bob
      const resB = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@test.local', password: 'Pass12345!' }),
      });
      assert.equal(resB.status, 200);
      const dataB = await resB.json();
      const sessionBId = dataB.sessionId;

      assert.notEqual(sessionAId, sessionBId, 'Sessions must have distinct IDs');

      // Request with Alice's cookie/header
      const checkA = await fetch(`${baseUrl}/api/auth/current`, {
        headers: { 'x-session-id': sessionAId },
      });
      const userA = (await checkA.json()).user;
      assert.equal(userA.email, 'alice@test.local');

      // Request with Bob's cookie/header
      const checkB = await fetch(`${baseUrl}/api/auth/current`, {
        headers: { 'x-session-id': sessionBId },
      });
      const userB = (await checkB.json()).user;
      assert.equal(userB.email, 'bob@test.local');

      // Re-verify Alice request immediately after Bob request (no global currentUser bleed)
      const recheckA = await fetch(`${baseUrl}/api/auth/current`, {
        headers: { 'x-session-id': sessionAId },
      });
      const reuserA = (await recheckA.json()).user;
      assert.equal(reuserA.email, 'alice@test.local');
    });

    test('logout destroys ONLY the requesting session, leaving other sessions intact', async () => {
      const session1 = createSession({
        id: 'user-1',
        name: 'User 1',
        email: 'user1@test.local',
        role: 'owner',
      });
      const session2 = createSession({
        id: 'user-2',
        name: 'User 2',
        email: 'user2@test.local',
        role: 'owner',
      });

      // Logout session 1
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'x-session-id': session1.id,
        },
      });
      assert.equal(logoutRes.status, 200);

      // Verify session 1 is destroyed
      assert.equal(getSession(session1.id), null);

      // Verify session 2 remains completely valid and active
      const activeSession2 = getSession(session2.id);
      assert.ok(activeSession2, 'Session 2 must remain valid after Session 1 logs out');
      assert.equal(activeSession2.user.email, 'user2@test.local');

      const check2 = await fetch(`${baseUrl}/api/auth/current`, {
        headers: { 'x-session-id': session2.id },
      });
      const user2 = (await check2.json()).user;
      assert.equal(user2.email, 'user2@test.local');
    });

    test('inactivity timeout revokes ONLY the idle session without affecting active sessions', async () => {
      const idleSession = createSession({
        id: 'user-idle',
        name: 'Idle User',
        email: 'idle@test.local',
        role: 'owner',
      });
      const activeSession = createSession({
        id: 'user-active',
        name: 'Active User',
        email: 'active@test.local',
        role: 'owner',
      });

      // Set idleSession activity back by 11 minutes (> 600,000 ms)
      idleSession.lastActivity = Date.now() - 660000;

      // Access with idleSession -> should expire with 401
      const idleRes = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`, {
        headers: { 'x-session-id': idleSession.id },
      });
      assert.equal(idleRes.status, 401);
      const idleData = await idleRes.json();
      assert.equal(idleData.sessionExpired, true);

      // Access with activeSession -> should succeed with 200
      const activeRes = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`, {
        headers: { 'x-session-id': activeSession.id },
      });
      assert.equal(activeRes.status, 200);
      assert.ok(getSession(activeSession.id), 'Active session must remain intact');
    });

    test('server ignores client-supplied spoofed ownerId/role in protected business creation', async () => {
      const legitUser = createSession({
        id: 'user-legit-owner',
        name: 'Legit Owner',
        email: 'legit@test.local',
        role: 'owner',
      });

      const res = await fetch(`${baseUrl}/api/businesses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': legitUser.id,
        },
        body: JSON.stringify({
          name: 'Spoof Test Business',
          category: 'restaurants-food',
          ownerId: 'spoofed-admin-id', // Trying to forge ownerId
          role: 'admin',
        }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.business.ownerId, 'user-legit-owner', 'Owner ID must be bound to server session');
    });
  });

  // =========================================================================
  // 3. PERSISTENCE & TRUTHFUL READINESS TESTS
  // =========================================================================
  describe('3. Persistence & Truthful Readiness', () => {
    test('reports truthful unconfigured status when durable DB is not provisioned', async () => {
      process.env.DATABASE_UNCONFIGURED = 'true';
      delete process.env.DATABASE_URL;
      delete process.env.SUPABASE_URL;

      const readiness = db.getDatabaseReadiness();
      assert.equal(readiness.configured, false);
      assert.equal(readiness.status, 'unconfigured');
      assert.equal(readiness.rlsVerified, false);
      assert.ok(readiness.setupRequired);

      const statusRes = await fetch(`${baseUrl}/api/system/status`);
      assert.equal(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.equal(statusData.integrations.database.configured, false);
      assert.equal(statusData.integrations.database.status, 'unconfigured');
      assert.equal(statusData.integrations.database.rlsVerified, false);
    });

    test('fails closed for privileged writes when durable DB is unconfigured', async () => {
      process.env.DATABASE_UNCONFIGURED = 'true';
      const adminSession = createSession({
        id: 'admin-user',
        name: 'Admin',
        email: 'admin@seeker.local',
        role: 'admin',
        aal: 'aal2',
      });

      const res = await fetch(`${baseUrl}/api/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': adminSession.id,
        },
        body: JSON.stringify({
          id: 'test-new-category',
          name: 'Test Category',
          description: 'Test',
          subcategories: [],
          suggestedKeywords: [],
        }),
      });
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.match(data.error, /Durable database is not configured/i);
    });

    test('verifies RLS only when policies are explicitly verified', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/pipsqueak';
      delete process.env.DATABASE_UNCONFIGURED;
      delete process.env.RLS_VERIFIED;

      const unverified = db.getDatabaseReadiness();
      assert.equal(unverified.configured, true);
      assert.equal(unverified.rlsVerified, false);
      assert.equal(unverified.status, 'connected_rls_pending');

      process.env.RLS_VERIFIED = 'true';
      const verified = db.getDatabaseReadiness();
      assert.equal(verified.configured, true);
      assert.equal(verified.rlsVerified, true);
      assert.equal(verified.status, 'production_ready_with_rls');
    });

    test('preserves existing records and permanent business IDs during migration', () => {
      const targetStore: { businesses: Business[]; users: any[] } = {
        businesses: [],
        users: [],
      };

      const result = db.migrateToDurableStorage(targetStore);
      assert.ok(result.migratedBusinesses > 0);
      assert.ok(result.preservedBusinessIds.includes('sk-2rn7bf7z'));
      assert.ok(result.preservedUserIds.includes('user-owner-1'));

      const soundView = targetStore.businesses.find((b) => b.id === 'sk-2rn7bf7z');
      assert.ok(soundView);
      assert.equal(soundView.name, 'Sound View Artisan Bakery');
      assert.equal(soundView.ownerId, 'user-owner-1');
    });
  });

  // =========================================================================
  // 4. ADDRESS PRIVACY & PROJECTION TESTS
  // =========================================================================
  describe('4. Address Privacy & Projection Across All Location Types', () => {
    function createTestBusiness(overrides: Partial<Business>): Business {
      return {
        id: 'sk-default-test',
        ownerId: 'owner-default',
        ownerEmail: 'owner@default.local',
        name: 'Default Test Business',
        shortDescription: 'Default test description',
        category: 'home-services',
        keywords: ['test'],
        address: '',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98101',
        serviceArea: 'Greater Seattle Area',
        phone: '206-555-0100',
        email: 'info@test.local',
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
        ...overrides,
      };
    }

    test('service-area business with conflicting legacy flags NEVER exposes street address', () => {
      const business: Business = createTestBusiness({
        id: 'sk-service-test',
        ownerId: 'owner-1',
        ownerEmail: 'owner@test.local',
        name: 'Puget Sound Plumbing',
        shortDescription: 'Licensed mobile plumbing services',
        category: 'home-services',
        keywords: ['plumber'],
        address: '1234 Private Home Lane',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98101',
        serviceArea: 'Greater Seattle Area',
        // Conflicting legacy flags:
        publishStreetAddress: true,
        isServiceAreaOnly: false,
        locationType: 'service_area',
        directionsUrl: 'https://maps.google.com/?q=1234+Private+Home+Lane',
        phone: '206-555-0100',
        email: 'info@plumbing.local',
        website: 'https://example.com',
      });

      const proj = getPublicBusinessProjection(business);
      assert.equal(proj.address, '', 'Street address must be completely empty');
      assert.equal(proj.publishStreetAddress, false, 'publishStreetAddress must be false');
      assert.equal(proj.directionsUrl, undefined, 'directionsUrl must be undefined');
      assert.equal(proj.isServiceAreaOnly, true, 'isServiceAreaOnly must be resolved to true');

      const protectedProj = enforceBusinessAddressPrivacy(business);
      assert.equal(protectedProj.address, '');
      assert.equal(protectedProj.publishStreetAddress, false);
      assert.equal(protectedProj.directionsUrl, undefined);
    });

    test('online-only business with publishStreetAddress=true NEVER exposes street address', () => {
      const business: Business = createTestBusiness({
        id: 'sk-online-test',
        ownerId: 'owner-2',
        ownerEmail: 'web@test.local',
        name: 'Cascade Digital Studio',
        shortDescription: 'Web design and digital agency',
        category: 'online-businesses',
        keywords: ['web design'],
        address: '777 Private Resident Ave',
        city: 'Tacoma',
        state: 'WA',
        zipCode: '98402',
        serviceArea: 'Worldwide',
        publishStreetAddress: true,
        locationType: 'online_only',
        phone: '253-555-0122',
        email: 'hello@cascadedigital.local',
        website: 'https://example.com',
      });

      const proj = getPublicBusinessProjection(business);
      assert.equal(proj.address, '');
      assert.equal(proj.publishStreetAddress, false);
      assert.equal(proj.directionsUrl, undefined);
    });

    test('home-based business with home visits DENIED strictly conceals private residence address', () => {
      const business: Business = createTestBusiness({
        id: 'sk-home-denied',
        ownerId: 'owner-3',
        ownerEmail: 'craft@test.local',
        name: 'Rainier Candle Atelier',
        shortDescription: 'Hand-poured artisan soy candles',
        category: 'home-based-businesses',
        keywords: ['candles'],
        address: '42 Secret Living Room Way',
        city: 'Olympia',
        state: 'WA',
        zipCode: '98501',
        serviceArea: 'South Sound Delivery',
        businessLocationType: 'Home-based',
        homeVisitAllowed: false,
        publishStreetAddress: true, // Attempted conflicting flag
        phone: '360-555-0199',
        email: 'candles@rainier.local',
        website: 'https://example.com',
      });

      const proj = getPublicBusinessProjection(business);
      assert.equal(proj.address, '');
      assert.equal(proj.publishStreetAddress, false);
      assert.equal(proj.directionsUrl, undefined);

      const protectedProj = enforceBusinessAddressPrivacy(business);
      assert.equal(protectedProj.address, '');
      assert.equal(protectedProj.publishStreetAddress, false);
    });

    test('home-based business with home visits ALLOWED publishes address only when chosen', () => {
      const base: Business = createTestBusiness({
        id: 'sk-home-allowed',
        ownerId: 'owner-4',
        ownerEmail: 'piano@test.local',
        name: 'Olympic Piano Studio',
        shortDescription: 'In-home private piano instruction',
        category: 'tutoring-education',
        keywords: ['piano lessons'],
        address: '500 Olympic View Dr',
        city: 'Bellevue',
        state: 'WA',
        zipCode: '98004',
        serviceArea: 'Bellevue & Eastside',
        businessLocationType: 'Home-based',
        homeVisitAllowed: true,
        publishStreetAddress: false,
        directionsUrl: 'https://maps.google.com/?q=500+Olympic+View+Dr',
        phone: '425-555-0144',
        email: 'piano@olympic.local',
        website: 'https://example.com',
      });

      // Owner chose NOT to publish address
      const projUnpublished = getPublicBusinessProjection(base);
      assert.equal(projUnpublished.address, '');
      assert.equal(projUnpublished.publishStreetAddress, false);
      assert.equal(projUnpublished.directionsUrl, undefined);

      // Owner chooses TO publish address
      base.publishStreetAddress = true;
      const projPublished = getPublicBusinessProjection(base);
      assert.equal(projPublished.address, '500 Olympic View Dr');
      assert.equal(projPublished.publishStreetAddress, true);
      assert.equal(projPublished.directionsUrl, 'https://maps.google.com/?q=500+Olympic+View+Dr');
    });

    test('mobile business requires no current address but preserves optional future address', () => {
      const business: Business = createTestBusiness({
        id: 'sk-mobile-test',
        ownerId: 'owner-5',
        ownerEmail: 'tacos@test.local',
        name: 'Cascadia Taco Truck',
        shortDescription: 'Mobile authentic taco truck',
        category: 'restaurants-food',
        keywords: ['tacos', 'food truck'],
        address: '999 Temporary Garage Rd',
        city: 'Seattle',
        state: 'WA',
        zipCode: '98103',
        serviceArea: 'Ballard and Fremont',
        businessLocationType: 'Mobile business',
        futureBusinessAddress: 'Future Brick-and-Mortar Opening Soon: 100 NW Market St',
        publishStreetAddress: true, // Should be suppressed
        phone: '206-555-0177',
        email: 'tacos@cascadia.local',
        website: 'https://example.com',
      });

      const proj = getPublicBusinessProjection(business);
      assert.equal(proj.address, '', 'Current street address must not be exposed');
      assert.equal(proj.publishStreetAddress, false);
      assert.equal(proj.futureBusinessAddress, 'Future Brick-and-Mortar Opening Soon: 100 NW Market St');
    });

    test('brick-and-mortar storefront retains normal street address publication', () => {
      const business: Business = createTestBusiness({
        id: 'sk-store-test',
        ownerId: 'owner-6',
        ownerEmail: 'bakery@test.local',
        name: 'Harbor Bookshop & Cafe',
        shortDescription: 'Independent books and artisanal espresso',
        category: 'retail-specialty-shops',
        keywords: ['books', 'coffee'],
        address: '400 Commercial Ave',
        city: 'Anacortes',
        state: 'WA',
        zipCode: '98221',
        serviceArea: 'Fidalgo Island',
        businessLocationType: 'Brick-and-mortar location',
        publishStreetAddress: true,
        directionsUrl: 'https://maps.google.com/?q=400+Commercial+Ave',
        phone: '360-555-0188',
        email: 'books@harbor.local',
        website: 'https://example.com',
      });

      const proj = getPublicBusinessProjection(business);
      assert.equal(proj.address, '400 Commercial Ave');
      assert.equal(proj.publishStreetAddress, true);
      assert.equal(proj.directionsUrl, 'https://maps.google.com/?q=400+Commercial+Ave');
    });

    test('protected API endpoints strictly apply safe address projection for owner queries', async () => {
      // Create a service-area business in the database
      const privateBiz = db.saveBusiness(
        createTestBusiness({
          id: 'sk-private-protected',
          ownerId: 'user-private-owner',
          ownerEmail: 'privateowner@test.local',
          name: 'Private Mobile Locksmith',
          shortDescription: 'Mobile locksmith',
          category: 'home-services',
          keywords: ['locksmith'],
          address: '888 Secret Home St',
          city: 'Seattle',
          state: 'WA',
          zipCode: '98101',
          serviceArea: 'Seattle',
          businessLocationType: 'Mobile business',
          publishStreetAddress: true, // Should be suppressed by privacy projection
          phone: '206-555-0199',
          email: 'locksmith@test.local',
          website: 'https://example.com',
        })
      );

      const session = createSession({
        id: 'user-private-owner',
        name: 'Private Owner',
        email: 'privateowner@test.local',
        role: 'owner',
      });

      // 1. GET /api/businesses/:id as owner
      const singleRes = await fetch(`${baseUrl}/api/businesses/${privateBiz.id}`, {
        headers: { 'x-session-id': session.id },
      });
      assert.equal(singleRes.status, 200);
      const singleData = await singleRes.json();
      assert.equal(singleData.business.address, '', 'Protected single endpoint must conceal private street address');
      assert.equal(singleData.business.publishStreetAddress, false);

      // 2. GET /api/businesses?ownerOnly=true as owner
      const listRes = await fetch(`${baseUrl}/api/businesses?ownerOnly=true`, {
        headers: { 'x-session-id': session.id },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      const fetched = listData.businesses.find((b: any) => b.id === privateBiz.id);
      assert.ok(fetched);
      assert.equal(fetched.address, '', 'Protected owner list must conceal private street address');
      assert.equal(fetched.publishStreetAddress, false);
    });
  });
});
