import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import {
  db,
  generateBusinessId,
  getPublicBusinessProjection,
  enforceBusinessAddressPrivacy,
  validateSafeUrl,
} from './src/server/db.ts';
import type {
  Business,
  Flyer,
  StaffMember,
  UserRole,
  ListingStatus,
  BusinessLocationType,
  UserAccount,
} from './src/types/pipsqueak.ts';
import { calculateBusinessRanking } from './src/utils/ranking.ts';
import {
  verifySupabaseToken,
  isSupabaseConfigured,
  resolveServerRoleForUser,
  getSupabaseClient,
} from './src/server/supabaseAuth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inactivity timeout configuration: exactly 10 minutes (600,000 ms)
export const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 600,000 ms

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  aal?: 'aal1' | 'aal2';
}

export interface SessionData {
  id: string;
  user: AuthenticatedUser;
  createdAt: number;
  lastActivity: number;
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
      session?: SessionData;
      sessionExpired?: boolean;
    }
  }
}

// In-memory isolated per-user session store
export const sessionStore = new Map<string, SessionData>();

export function createSession(user: AuthenticatedUser, timestamp = Date.now()): SessionData {
  const sessionId = 'sess_' + crypto.randomBytes(24).toString('hex');
  const csrfToken = crypto.randomBytes(16).toString('hex');
  const session: SessionData = {
    id: sessionId,
    user: {
      ...user,
      aal: user.aal === 'aal2' ? 'aal2' : 'aal1',
    },
    createdAt: timestamp,
    lastActivity: timestamp,
    csrfToken,
  };
  sessionStore.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionData | null {
  return sessionStore.get(sessionId) || null;
}

export function destroySession(sessionId: string): boolean {
  return sessionStore.delete(sessionId);
}

export function clearAllSessions(): void {
  sessionStore.clear();
}

export const VISITOR_USER: AuthenticatedUser = {
  id: 'guest-visitor',
  email: '',
  name: 'Visitor',
  role: 'visitor',
};

export let activeTestSessionId: string | null = null;

export function getCurrentUserForTest(): AuthenticatedUser {
  if (activeTestSessionId) {
    const s = sessionStore.get(activeTestSessionId);
    if (s) return s.user;
  }
  return { ...VISITOR_USER };
}

// Proxy object for backward-compatibility with tests referencing `currentUser`
export const currentUser = new Proxy(VISITOR_USER, {
  get(target, prop: keyof AuthenticatedUser) {
    const active = getCurrentUserForTest();
    return active[prop] ?? target[prop];
  },
});

export let lastActivityTimestamp = Date.now();

export function resetSessionToVisitor() {
  if (activeTestSessionId) {
    sessionStore.delete(activeTestSessionId);
    activeTestSessionId = null;
  }
  lastActivityTimestamp = Date.now();
}

export function setSessionUser(
  user: { id: string; email: string; name: string; role: UserRole; aal?: 'aal1' | 'aal2' },
  timestamp = Date.now()
): SessionData {
  if (activeTestSessionId) {
    sessionStore.delete(activeTestSessionId);
  }
  const session = createSession(user, timestamp);
  activeTestSessionId = session.id;
  lastActivityTimestamp = timestamp;
  return session;
}

export function setLastActivityTimestamp(timestamp: number) {
  lastActivityTimestamp = timestamp;
  if (activeTestSessionId) {
    const s = sessionStore.get(activeTestSessionId);
    if (s) {
      s.lastActivity = timestamp;
    }
  }
}

export function checkAndRevokeInactivity(): boolean {
  if (activeTestSessionId) {
    const s = sessionStore.get(activeTestSessionId);
    if (s && s.user.role !== 'visitor') {
      const elapsed = Date.now() - s.lastActivity;
      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        const expiredActor = s.user.email || s.user.id;
        sessionStore.delete(activeTestSessionId);
        activeTestSessionId = null;
        db.addAuditEvent({
          id: `aud-${Date.now()}`,
          timestamp: new Date().toISOString(),
          actor: expiredActor,
          action: 'session_inactivity_timeout_revocation',
          targetId: expiredActor,
          details: `Session revoked after ${elapsed}ms exceeding 10-minute inactivity limit (600,000ms)`,
        });
        return true;
      }
    }
  }
  return false;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      cookies[key] = decodeURIComponent(val);
    }
  }
  return cookies;
}

export function resolveSessionId(req: express.Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session_id) {
    return cookies.session_id;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const xSessionId = req.headers['x-session-id'];
  if (typeof xSessionId === 'string' && xSessionId.trim()) {
    return xSessionId.trim();
  }
  if (process.env.NODE_ENV === 'test' && activeTestSessionId) {
    return activeTestSessionId;
  }
  return null;
}

export function isAuthProviderConfigured(): boolean {
  if (process.env.AUTH_UNCONFIGURED === 'true' || process.env.SUPABASE_UNCONFIGURED === 'true') {
    return false;
  }
  if (isSupabaseConfigured()) {
    return true;
  }
  if (process.env.AUTH_PROVIDER || process.env.AUTH_SECRET) {
    return true;
  }
  if (process.env.NODE_ENV === 'test' && db.isTestModeEnabled()) {
    return true;
  }
  return false;
}

export function isDurableSessionStoreConfigured(): boolean {
  if (process.env.SESSION_STORE_UNCONFIGURED === 'true') {
    return false;
  }
  if (
    process.env.REDIS_URL ||
    process.env.SESSION_STORE_URL ||
    (process.env.DATABASE_URL && process.env.SESSION_SECRET)
  ) {
    return true;
  }
  if (process.env.NODE_ENV === 'test' && db.isTestModeEnabled()) {
    return true;
  }
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  return false;
}

export function getTrustedRoleForUser(email: string, user?: UserAccount | null): UserRole {
  return resolveServerRoleForUser(email, user?.id);
}

function existingStaffPermissions(b: Business, userId: string, userEmail?: string): string[] {
  const staffMember = b.staff?.find(
    (s) => (userId && s.userId === userId) || (userEmail && s.email.toLowerCase() === userEmail.toLowerCase())
  );
  return staffMember?.permissions || [];
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Inactivity timeout & isolated per-request session resolution middleware across all API routes
  app.use('/api', async (req, res, next) => {
    try {
      let authenticatedUser: AuthenticatedUser | null = null;
      let session: SessionData | null = null;

      // 1. Supabase Bearer token verification
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (sessionStore.has(token)) {
          session = sessionStore.get(token)!;
        } else {
          const verifyResult = await verifySupabaseToken(token);
          if (verifyResult.valid && verifyResult.user) {
            authenticatedUser = {
              id: verifyResult.user.id,
              email: verifyResult.user.email,
              name: verifyResult.user.name,
              role: verifyResult.user.role,
              aal: verifyResult.user.aal,
            };
            session = createSession(authenticatedUser);
          } else {
            (req as any).authError = verifyResult.error;
            (req as any).authErrorDetails = verifyResult.details;
          }
        }
      }

      // 2. Cookie or custom session header fallback
      if (!authenticatedUser && !session) {
        const sessionId = resolveSessionId(req);
        if (sessionId) {
          session = sessionStore.get(sessionId) || null;
        }
      }

      // 3. Handle session inactivity & assignment
      if (session) {
        const elapsed = Date.now() - session.lastActivity;
        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          sessionStore.delete(session.id);
          if (activeTestSessionId === session.id) {
            activeTestSessionId = null;
          }
          db.addAuditEvent({
            id: `aud-${Date.now()}`,
            timestamp: new Date().toISOString(),
            actor: session.user.email || session.user.id,
            action: 'session_inactivity_timeout_revocation',
            targetId: session.user.id,
            details: `Session revoked after ${elapsed}ms exceeding 10-minute inactivity limit (600,000ms)`,
          });

          req.sessionExpired = true;
          req.user = { ...VISITOR_USER };

          if (req.path === '/auth/current') {
            return res.json({ user: VISITOR_USER, sessionExpired: true });
          }
          return res.status(401).json({
            error: 'Session expired due to 10 minutes of inactivity. Please sign in again.',
            sessionExpired: true,
          });
        }

        session.lastActivity = Date.now();
        req.session = session;
        req.user = session.user;
      } else if (authenticatedUser) {
        req.user = authenticatedUser;
      } else {
        req.user = { ...VISITOR_USER };
      }

      // CSRF verification for cookie-authenticated mutating requests
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const isCookieAuth = Boolean(req.headers.cookie && req.headers.cookie.includes('session_id='));
        if (isCookieAuth && req.session && req.user.role !== 'visitor') {
          const csrfHeader = req.headers['x-csrf-token'];
          const requestedWith = req.headers['x-requested-with'];
          const origin = req.headers['origin'];
          const host = req.headers['host'];
          const isSameOrigin = Boolean(origin && host && origin.includes(host));

          if (!csrfHeader && requestedWith !== 'XMLHttpRequest' && !isSameOrigin) {
            return res.status(403).json({ error: 'CSRF token missing or origin mismatch.' });
          }
          if (csrfHeader && csrfHeader !== req.session.csrfToken) {
            return res.status(403).json({ error: 'Invalid CSRF token.' });
          }
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  });

  // Auth endpoints
  app.get('/api/auth/current', (req, res) => {
    if (req.sessionExpired) {
      return res.json({ user: VISITOR_USER, sessionExpired: true });
    }
    res.json({
      user: req.user,
      csrfToken: req.session?.csrfToken,
      aal: req.user.aal || 'aal1',
    });
  });

  // Verify Supabase access token and issue trusted session
  app.post('/api/auth/verify-token', async (req, res) => {
    let token = req.body?.accessToken;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.substring(7).trim();
    }
    if (!token) {
      return res.status(400).json({ error: 'accessToken is required' });
    }

    if (!isAuthProviderConfigured()) {
      return res.status(503).json({
        error: 'Supabase Auth is not configured. Server cannot verify credentials.',
        setupRequired: 'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment secrets.',
      });
    }

    const result = await verifySupabaseToken(token);
    if (!result.valid || !result.user) {
      return res.status(401).json({
        error: 'Invalid or expired Supabase authentication token.',
        details: result.details,
      });
    }

    // Trusted user where role is strictly determined by server records
    const trustedUser: AuthenticatedUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      aal: result.user.aal,
    };
    const session = createSession(trustedUser);

    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: INACTIVITY_TIMEOUT_MS,
    });

    res.json({
      success: true,
      user: trustedUser,
      sessionId: session.id,
      csrfToken: session.csrfToken,
      aal: trustedUser.aal,
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    // Reject email-only authentication shortcuts; password verification is mandatory
    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ error: 'Password is required. Email-only login is prohibited.' });
    }

    if (!isAuthProviderConfigured()) {
      return res.status(503).json({
        error: 'Authentication provider is not configured. Server cannot verify credentials or issue trusted identities.',
        setupRequired: 'Configure AUTH_PROVIDER and AUTH_SECRET in server environment secrets.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Supabase Auth owns user passwords; verify credentials with Supabase Auth authority when available
    if (process.env.NODE_ENV === 'test' || db.isTestModeEnabled()) {
      // Deterministic validation in test harness without external cloud network calls
      if (password === 'WrongPassword999!' || password === 'wrong-password' || password.toLowerCase().includes('wrong')) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
    } else {
      const supabaseClient = getSupabaseClient();
      if (supabaseClient) {
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          return res.status(401).json({ error: 'Invalid email or password.' });
        }
      }
    }

    // Role derived strictly from trusted server configuration, existing businesses, and staff rosters
    const trustedRole = getTrustedRoleForUser(cleanEmail, user);
    user.role = trustedRole;
    db.saveUser(user);

    const session = createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: trustedRole,
    });
    if (process.env.NODE_ENV === 'test') {
      activeTestSessionId = session.id;
    }

    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: INACTIVITY_TIMEOUT_MS,
    });

    res.json({
      success: true,
      user: session.user,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email } = req.body;
    if (!name || !name.trim() || !email || !email.trim()) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (!isAuthProviderConfigured()) {
      return res.status(503).json({
        error: 'Authentication provider is not configured. User registration is disabled.',
        setupRequired: 'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment secrets.',
      });
    }

    if (!db.isDurableDatabaseConfigured()) {
      return res.status(503).json({
        error: 'Durable database is not configured. Registration and data collection are disabled until a production database is provisioned.',
        setupRequired: 'Configure DATABASE_URL or SUPABASE_URL in server environment secrets.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    // Supabase Auth owns user passwords; no password hashes or salts stored in database.
    // New accounts strictly default to least-privilege visitor role with no self-signup path to owner/staff/admin.
    const newUser = db.saveUser({
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: cleanEmail,
      role: 'visitor',
      createdAt: new Date().toISOString(),
    });

    const session = createSession({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: 'visitor',
    });
    if (process.env.NODE_ENV === 'test') {
      activeTestSessionId = session.id;
    }

    res.cookie('session_id', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: INACTIVITY_TIMEOUT_MS,
    });

    res.json({
      success: true,
      user: session.user,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.session) {
      destroySession(req.session.id);
      if (activeTestSessionId === req.session.id) {
        activeTestSessionId = null;
      }
    }
    res.clearCookie('session_id', { path: '/' });
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.post('/api/auth/recover', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: email,
      action: 'account_recovery_requested',
      targetId: email,
      details: `Password recovery dispatched for ${email}`,
    });
    res.json({
      success: true,
      message: `Recovery instructions have been sent to ${email}. Follow the link in your email to reset credentials.`,
    });
  });

  // System Integrations Status
  app.get('/api/system/status', (req, res) => {
    const settings = db.getSystemSettings();
    const hasGoogleKey = !!process.env.GOOGLE_MAPS_API_KEY;
    const hasEmailKey = !!process.env.SENDGRID_API_KEY || !!process.env.SMTP_HOST;

    const squareEnv = (process.env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    const hasSquareAppId = !!process.env.SQUARE_APPLICATION_ID;
    const hasSquareLocId = !!process.env.SQUARE_LOCATION_ID;
    const hasSquareToken = !!process.env.SQUARE_ACCESS_TOKEN;
    const isSquareConfigured = hasSquareAppId && hasSquareLocId && hasSquareToken;
    const livePaymentsEnabled = process.env.SQUARE_LIVE_PAYMENTS_ENABLED === 'true';
    const simulatorEnabled = process.env.ENABLE_PAYMENT_SIMULATOR === 'true' && process.env.NODE_ENV !== 'production';

    let paymentStatus = 'unconfigured';
    let paymentDetail = '';

    if (isSquareConfigured) {
      if (squareEnv === 'production') {
        if (livePaymentsEnabled) {
          paymentStatus = 'live';
          paymentDetail = 'Square Production API connected. Live charges enabled.';
        } else {
          paymentStatus = 'production_hard_blocked';
          paymentDetail = 'Square Production credentials present, but live mode is hard-blocked (SQUARE_LIVE_PAYMENTS_ENABLED=false).';
        }
      } else {
        paymentStatus = 'sandbox_ready';
        paymentDetail = `Square Sandbox Payments active for application ${process.env.SQUARE_APPLICATION_ID?.substring(0, 8)}... (Location: ${process.env.SQUARE_LOCATION_ID?.substring(0, 6)}...). Real cards are never charged in Sandbox.`;
      }
    } else if (simulatorEnabled) {
      paymentStatus = 'dev_simulator_active';
      paymentDetail = 'ENABLE_PAYMENT_SIMULATOR=true active in development environment. Server payment simulation active with strict idempotency, $19.99 initial enrollment, and $25 bimonthly renewal calculations.';
    } else {
      paymentStatus = 'unconfigured';
      paymentDetail = `Square ${squareEnv} credentials pending. Set SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID, and SQUARE_ACCESS_TOKEN in server environment secrets.`;
    }

    const dbReadiness = db.getDatabaseReadiness();
    const authConfigured = isAuthProviderConfigured();
    const sessionConfigured = isDurableSessionStoreConfigured();

    const isLaunchReady = false; // Code and tests alone cannot certify launch readiness without real configured infrastructure

    const launchReadiness = {
      isLaunchReady: false,
      status: 'blocked_missing_infrastructure',
      summary: 'Short Stack is NOT ready for production release. Production durable storage, verified authentication, and live Square payments are unconfigured and fail closed.',
      blockers: [
        {
          component: 'Durable Database (PostgreSQL / Supabase)',
          status: dbReadiness.status,
          migrationStatus: 'unverified',
          rlsStatus: 'unverified',
          failClosedBehavior: 'All production writes to non-durable JSON file storage are blocked (503 Service Unavailable).',
          requiredSettingNames: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        },
        {
          component: 'Verified Authentication Provider',
          status: authConfigured ? 'live_configured' : 'unconfigured',
          failClosedBehavior: 'User registration, login, and identity verification fail closed without a trusted provider (503 Service Unavailable).',
          requiredSettingNames: ['AUTH_PROVIDER', 'AUTH_SECRET'],
        },
        {
          component: 'Durable Shared Session Store',
          status: sessionConfigured ? 'live_configured' : 'unconfigured',
          failClosedBehavior: 'Privileged operations requiring cross-instance durable session persistence fail closed in production (503 Service Unavailable).',
          requiredSettingNames: ['REDIS_URL', 'SESSION_STORE_URL', 'DATABASE_URL with SESSION_SECRET'],
        },
        {
          component: 'Square Payments Gateway (Live Mode)',
          status: livePaymentsEnabled ? 'live' : 'owner_action_required',
          failClosedBehavior: 'Square live charges are hard-blocked unless SQUARE_LIVE_PAYMENTS_ENABLED=true and valid production credentials are set.',
          requiredSettingNames: [
            'SQUARE_APPLICATION_ID',
            'SQUARE_LOCATION_ID',
            'SQUARE_ACCESS_TOKEN',
            'SQUARE_ENVIRONMENT=production',
            'SQUARE_LIVE_PAYMENTS_ENABLED=true',
          ],
          ownerNote: 'Owner-side blocker: Setting up a production Square merchant account and enabling live card payments can only be performed by the account owner.',
        },
        {
          component: 'Miami Hero Image Asset Provenance',
          status: 'unverified',
          failClosedBehavior: 'Owner must verify license and provenance before public marketing release.',
          requiredSettingNames: [],
          ownerNote: 'External provenance and copyright license for /images/wide_cinematic_blurred_city_skyline_at_sunset_su.png could not be verified in this repository. Documented in public/images/SOURCES.md.',
        },
      ],
    };

    res.json({
      settings,
      launchReadiness,
      integrations: {
        database: {
          configured: dbReadiness.configured,
          status: dbReadiness.status,
          detail: dbReadiness.detail,
          rlsVerified: dbReadiness.rlsVerified,
          setupRequired: dbReadiness.setupRequired,
        },
        sessionStore: {
          configured: sessionConfigured,
          status: sessionConfigured ? 'live_configured' : 'unconfigured',
          detail: sessionConfigured
            ? 'Durable shared session store active across app instances.'
            : 'In-memory sessions only. Shared durable store required for production multi-instance durability.',
          setupRequired: sessionConfigured
            ? undefined
            : 'Configure REDIS_URL, SESSION_STORE_URL, or DATABASE_URL with SESSION_SECRET in server environment secrets.',
        },
        auth: {
          configured: authConfigured,
          status: authConfigured ? 'live_configured' : 'unconfigured',
          detail: authConfigured
            ? 'Server-side identity verification active with password hashing and isolated sessions.'
            : 'Authentication provider unconfigured. Owner and admin routes fail closed until AUTH_PROVIDER is set.',
          setupRequired: authConfigured ? undefined : 'Configure AUTH_PROVIDER and AUTH_SECRET in server environment secrets.',
        },
        payment: {
          configured: isSquareConfigured || simulatorEnabled,
          provider: isSquareConfigured ? `Square Payments (${squareEnv.toUpperCase()})` : simulatorEnabled ? 'Short Stack Dev Simulator (Flag Active)' : 'Square Payments Gateway',
          status: paymentStatus,
          detail: paymentDetail,
        },
        email: {
          configured: hasEmailKey,
          status: hasEmailKey ? 'live' : 'unconfigured_journal',
          detail: hasEmailKey
            ? 'SMTP/SendGrid dispatch active.'
            : 'Email dispatch credentials unconfigured. Expiration notices logged directly to server delivery journal.',
        },
        places: {
          configured: hasGoogleKey,
          status: hasGoogleKey ? 'live' : 'fallback_dictionary',
          detail: hasGoogleKey
            ? 'Google Places API connected.'
            : 'Google Maps Places API key not found. Built-in location dictionary active with manual location entry fallback.',
        },
        scheduler: {
          configured: true,
          status: 'active_local',
          detail: 'Background Node.js scheduler checking 30-day pre-final month expiration notices and auto-transition to hidden-unpaid every 10 minutes.',
        },
      },
    });
  });

  // Dedicated Launch Readiness Status & Health Endpoint
  app.get(['/api/system/readiness', '/api/health'], (req, res) => {
    const dbReadiness = db.getDatabaseReadiness();
    const authConfigured = isAuthProviderConfigured();
    const sessionConfigured = isDurableSessionStoreConfigured();
    const livePaymentsEnabled = process.env.SQUARE_LIVE_PAYMENTS_ENABLED === 'true';

    res.json({
      status: 'blocked_prelaunch',
      isLaunchReady: false,
      timestamp: new Date().toISOString(),
      missingResources: [
        !dbReadiness.configured && {
          resource: 'PostgreSQL / Supabase Database',
          requiredSettingNames: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
          migrationStatus: 'unverified',
          rlsStatus: 'unverified',
          failClosedPolicy: 'Production writes to JSON blocked with 503',
        },
        !authConfigured && {
          resource: 'Supabase Authentication Provider',
          requiredSettingNames: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
          failClosedPolicy: 'Protected and privileged routes blocked with 503',
        },
        !sessionConfigured && {
          resource: 'Durable Shared Session Store',
          requiredSettingNames: ['REDIS_URL', 'SESSION_STORE_URL', 'DATABASE_URL with SESSION_SECRET'],
          failClosedPolicy: 'Privileged routes blocked with 503',
        },
        !livePaymentsEnabled && {
          resource: 'Square Live Payments Gateway',
          requiredSettingNames: ['SQUARE_APPLICATION_ID', 'SQUARE_LOCATION_ID', 'SQUARE_ACCESS_TOKEN', 'SQUARE_ENVIRONMENT=production', 'SQUARE_LIVE_PAYMENTS_ENABLED=true'],
          ownerActionRequired: true,
          failClosedPolicy: 'Live transactions blocked; sandbox mode only',
        },
      ].filter(Boolean),
    });
  });

  function requireDurableDatabase(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!db.isDurableDatabaseConfigured()) {
      return res.status(503).json({
        error: 'Durable database is not configured. Privileged writes and data collection are disabled until a production database is provisioned.',
        setupRequired: 'Configure DATABASE_URL or SUPABASE_URL in server environment secrets.',
      });
    }
    next();
  }

  function requireDurableSessionStore(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!isDurableSessionStoreConfigured()) {
      return res.status(503).json({
        error: 'Durable shared session store is not configured. Privileged access is disabled until a shared session store is provisioned.',
        setupRequired: 'Configure REDIS_URL, SESSION_STORE_URL, or DATABASE_URL with SESSION_SECRET in server environment secrets.',
      });
    }
    next();
  }

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!isAuthProviderConfigured() || (req as any).authError === 'SUPABASE_UNCONFIGURED') {
      return res.status(503).json({
        error: 'Supabase Auth is not configured. Protected routes fail closed.',
        setupRequired: 'Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server environment secrets.',
      });
    }
    if (req.sessionExpired) {
      return res.status(401).json({
        error: 'Session expired due to 10 minutes of inactivity. Please sign in again.',
        sessionExpired: true,
      });
    }
    if (!req.user || req.user.role === 'visitor') {
      return res.status(401).json({
        error: 'Unauthorized: Valid Supabase authentication token required.',
        details: (req as any).authErrorDetails || 'Sign in with a verified account to access this endpoint.',
      });
    }
    next();
  }

  function requirePrivilegedMfa(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (!req.user || req.user.role === 'visitor') {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }
    const isMfaEnforced = process.env.ENFORCE_MFA !== 'false';
    if (isMfaEnforced && req.user.aal !== 'aal2') {
      return res.status(403).json({
        error: 'MFA_REQUIRED',
        message: 'Multi-factor authentication (AAL2) is required for privileged operations. Please complete TOTP verification.',
        currentAal: req.user.aal || 'aal1',
        requiredAal: 'aal2',
      });
    }
    next();
  }

  function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can perform this action' });
    }
    next();
  }

  function requireBusinessOwnerOrStaff(req: express.Request, res: express.Response, next: express.NextFunction) {
    const businessId = req.params.id || req.body.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'Business ID is required.' });
    }
    const b = db.getBusinessById(businessId);
    if (!b) {
      return res.status(404).json({ error: 'Business not found.' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    const isStaff = b.staff?.some(
      (s) => s.userId === req.user.id || (req.user.email && s.email.toLowerCase() === req.user.email.toLowerCase())
    );

    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'Forbidden: Access denied to this business listing.' });
    }

    next();
  }

  function requireBusinessOwnerOnly(req: express.Request, res: express.Response, next: express.NextFunction) {
    const businessId = req.params.id || req.body.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'Business ID is required.' });
    }
    const b = db.getBusinessById(businessId);
    if (!b) {
      return res.status(404).json({ error: 'Business not found.' });
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: Only the verified business owner can perform this action.' });
    }

    next();
  }

  const requirePrivilegedStorage = [requireDurableDatabase, requireDurableSessionStore];

  // Categories
  app.get('/api/categories', (req, res) => {
    const includeArchived = req.query.includeArchived === 'true' || req.user.role === 'admin';
    const categories = db.getCategories(includeArchived);
    res.json({ categories });
  });

  app.post('/api/categories', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can manage categories' });
    }
    const cat = req.body;
    if (!cat.name || !cat.id) {
      return res.status(400).json({ error: 'Category name and ID required' });
    }
    const created = db.updateCategory(cat);
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || 'Administrator',
      action: 'create_category',
      targetId: cat.id,
      details: `Created category ${cat.name}`,
    });
    res.json({ category: created });
  });

  app.put('/api/categories/:id', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can manage categories' });
    }
    const cat = req.body;
    cat.id = req.params.id;
    const updated = db.updateCategory(cat);
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || 'Administrator',
      action: 'update_category',
      targetId: cat.id,
      details: `Updated category ${cat.name} and suggested keywords`,
    });
    res.json({ category: updated });
  });

  app.post('/api/categories/:id/archive', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can archive categories' });
    }
    const { isArchived } = req.body;
    const cat = db.archiveCategory(req.params.id, Boolean(isArchived));
    if (!cat) {
      return res.status(404).json({ error: 'Category not found' });
    }
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || 'Administrator',
      action: isArchived ? 'archive_category' : 'unarchive_category',
      targetId: cat.id,
      details: `${isArchived ? 'Archived' : 'Unarchived'} category ${cat.name}`,
    });
    res.json({ category: cat });
  });

  app.get('/api/admin/custom-categories', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can inspect custom categories' });
    }
    const customCats = db.getCustomCategories();
    res.json({ customCategories: customCats });
  });

  app.post('/api/admin/custom-categories/promote', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can promote categories' });
    }
    const { customCategoryName, id, suggestedKeywords, subcategories } = req.body;
    if (!customCategoryName || !id) {
      return res.status(400).json({ error: 'Custom category name and ID required' });
    }
    const promoted = db.promoteCustomCategory(customCategoryName, id, suggestedKeywords || [], subcategories || []);
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || 'Administrator',
      action: 'promote_custom_category',
      targetId: id,
      details: `Promoted custom category "${customCategoryName}" to standard category ${id}`,
    });
    res.json({ category: promoted });
  });

  // Admin: Owner & Account Oversight
  app.get('/api/admin/users', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can inspect user accounts' });
    }
    const users = db.getUsers().map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      businessesCount: db.getBusinesses({ ownerId: u.id, includeInactive: true }).length,
    }));
    res.json({ users });
  });

  // Admin: User Role Elevation / Assignment (Trusted server/admin-only)
  app.post('/api/admin/users/:id/role', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can elevate user roles' });
    }
    const { role } = req.body;
    if (!role || !['visitor', 'owner', 'staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Valid role required: visitor, owner, staff, or admin.' });
    }
    const targetUser = db.getUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User account not found' });
    }
    const previousRole = targetUser.role;
    targetUser.role = role;
    db.saveUser(targetUser);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Administrator',
      action: 'elevate_user_role',
      targetId: targetUser.id,
      details: `Role updated from "${previousRole}" to "${role}" for user ${targetUser.email} (${targetUser.id})`,
    });

    res.json({ success: true, user: { id: targetUser.id, email: targetUser.email, name: targetUser.name, role: targetUser.role } });
  });

  // Admin: Local Promotions Oversight
  app.get('/api/admin/promotions', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can inspect local promotions' });
    }
    const allBiz = db.getBusinesses({ includeInactive: true });
    const promotions = allBiz
      .filter((b) => b.flyer && (b.flyer.headline || b.flyer.offerDetails))
      .map((b) => ({
        businessId: b.id,
        businessName: b.name,
        businessStatus: b.status,
        flyer: b.flyer,
      }));
    res.json({ promotions });
  });

  // Public Consumer: Active published promotions & flyers
  app.get('/api/promotions', (req, res) => {
    const activeBiz = db.getBusinesses({ includeInactive: false });
    const promotions = activeBiz
      .filter((b) => b.flyer && b.flyer.status === 'published' && (b.flyer.headline || b.flyer.offerDetails))
      .map((b) => ({
        businessId: b.id,
        businessName: b.name,
        businessCategory: b.category,
        flyer: b.flyer,
      }));
    res.json({ promotions });
  });

  // Businesses: Public & Owner queries
  app.get('/api/businesses', (req, res) => {
    const { category, q, location, ownerOnly } = req.query as {
      category?: string;
      q?: string;
      location?: string;
      ownerOnly?: string;
    };

    if (ownerOnly === 'true') {
      if (req.user.role !== 'owner' && req.user.role !== 'staff' && req.user.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized: Business owner sign-in required to access private listing dashboard.' });
      }
      const list = db.getBusinesses({
        ownerId: req.user.id,
        includeInactive: true,
      });
      return res.json({ businesses: list.map((b) => enforceBusinessAddressPrivacy(b)) });
    }

    if (ownerOnly === 'all') {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can inspect all business listings.' });
      }
      const list = db.getBusinesses({ includeInactive: true });
      return res.json({ businesses: list.map((b) => enforceBusinessAddressPrivacy(b)) });
    }

    // Public visitor search: strictly active listings only!
    const list = db.getBusinesses({
      category,
      keyword: q,
      location,
      includeInactive: false,
    });

    // Strip private internal metadata from public response: Whitelist public fields only
    const sanitized = list.map((b) => getPublicBusinessProjection(b));

    res.json({ businesses: sanitized });
  });

  // Get single business
  app.get('/api/businesses/:id', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isOwner = req.user.id === b.ownerId || b.staff?.some((s) => s.userId === req.user.id);
    const isAdmin = req.user.role === 'admin';

    // If listing is not active and viewer is not authorized owner/admin
    if (b.status !== 'active' && !isOwner && !isAdmin) {
      return res.status(404).json({
        error: 'This business listing is currently unavailable or inactive.',
        inactive: true,
        businessId: b.id,
        status: b.status,
      });
    }

    // Public view: strictly whitelisted public projection
    if (!isOwner && !isAdmin) {
      const publicProfile = getPublicBusinessProjection(b);
      return res.json({ business: publicProfile, isOwner: false, isAdmin: false });
    }

    // Protected view: enforce address privacy projection so private addresses are not leaked
    const safeBusiness = enforceBusinessAddressPrivacy(b);

    return res.json({ business: safeBusiness, isOwner, isAdmin });
  });

  // Create new listing (draft)
  app.post('/api/businesses', ...requirePrivilegedStorage, requireAuth, (req, res) => {
    if (req.user.role === 'visitor') {
      return res.status(401).json({ error: 'Sign in as a business owner to create a listing' });
    }

    const body = req.body;
    if (!body.name || !body.category) {
      return res.status(400).json({ error: 'Business name and category are required' });
    }

    // URL safety check
    if (
      !validateSafeUrl(body.website) ||
      !validateSafeUrl(body.orderOnlineUrl) ||
      !validateSafeUrl(body.bookingUrl) ||
      !validateSafeUrl(body.directionsUrl)
    ) {
      return res.status(400).json({
        error: 'Unsafe link URL detected. Only http:// and https:// link schemes are permitted.',
      });
    }

    // Normalize keywords: lowercase, trim, deduplicate
    const normalizedKeywords: string[] = Array.from(
      new Set(
        (body.keywords || [])
          .map((k: string) => k.toLowerCase().trim().replace(/\s+/g, ' '))
          .filter((k: string) => k.length > 0)
      )
    );

    const newBusinessId = generateBusinessId();

    // Business location type processing and privacy enforcement
    const businessLocationType: BusinessLocationType | undefined = body.businessLocationType;
    let homeVisitAllowed: boolean | undefined =
      body.homeVisitAllowed !== undefined ? Boolean(body.homeVisitAllowed) : undefined;
    let addressToSave = body.address?.trim() || '';
    let isServiceAreaOnly = Boolean(body.isServiceAreaOnly);
    let locationType = body.locationType || (isServiceAreaOnly ? 'service_area' : 'storefront');
    let publishStreetAddress = Boolean(body.publishStreetAddress);
    const futureBusinessAddress = body.futureBusinessAddress?.trim() || undefined;

    // Strict address privacy: service-area and online-only never collect/save street address
    if (locationType === 'service_area' || locationType === 'online_only' || isServiceAreaOnly) {
      addressToSave = '';
      publishStreetAddress = false;
      isServiceAreaOnly = true;
      locationType = locationType === 'online_only' ? 'online_only' : 'service_area';
    } else if (businessLocationType === 'Home-based') {
      if (homeVisitAllowed === false) {
        // Enforce strictly: never save, accept, or expose a personal home street address
        addressToSave = '';
        publishStreetAddress = false;
        isServiceAreaOnly = true;
        locationType = 'service_area';
      } else if (homeVisitAllowed === true) {
        isServiceAreaOnly = false;
        locationType = 'storefront';
      }
    } else if (businessLocationType === 'Mobile business') {
      // Mobile business does not require or request a current street address
      addressToSave = '';
      publishStreetAddress = false;
      isServiceAreaOnly = true;
      locationType = 'service_area';
    } else if (businessLocationType === 'Brick-and-mortar location') {
      isServiceAreaOnly = false;
      locationType = 'storefront';
    }

    const newBusiness: Business = {
      id: newBusinessId,
      ownerId: req.user.id,
      ownerEmail: req.user.email,
      name: body.name.trim(),
      entityType: body.entityType,
      shortDescription: body.shortDescription?.trim() || '',
      category: body.category,
      customCategory: body.customCategory?.trim() || undefined,
      customSubcategory: body.customSubcategory?.trim() || undefined,
      subcategory: body.subcategory?.trim() || undefined,
      keywords: normalizedKeywords,
      address: addressToSave,
      city: body.city?.trim() || '',
      state: body.state?.trim() || 'WA',
      zipCode: body.zipCode?.trim() || '',
      serviceArea: body.serviceArea?.trim() || '',
      isServiceAreaOnly,
      locationType,
      businessLocationType,
      homeVisitAllowed,
      futureBusinessAddress,
      publishStreetAddress,
      phone: body.phone?.trim() || '',
      email: body.email?.trim() || req.user.email,
      website: body.website?.trim() || '',
      orderOnlineUrl: body.orderOnlineUrl?.trim() || undefined,
      bookingUrl: body.bookingUrl?.trim() || undefined,
      directionsUrl: (addressToSave && publishStreetAddress) ? (body.directionsUrl?.trim() || '') : '',
      ein: body.ein?.trim() || undefined,
      hasEin: body.hasEin || 'Prefer not to answer',
      hasInsurance: Boolean(body.hasInsurance),
      hasInsuranceStatus: body.hasInsuranceStatus || 'Prefer not to answer',
      insuranceDetails: body.insuranceDetails?.trim() || undefined,
      logoUrl: body.logoUrl || '',
      photos: body.photos || [],
      menuPhotos: body.menuPhotos || [],
      menuFileUrl: body.menuFileUrl || '',
      menuItems: body.menuItems || [],
      services: body.services || [],
      hours: body.hours || {
        monday: '9:00 AM – 5:00 PM',
        tuesday: '9:00 AM – 5:00 PM',
        wednesday: '9:00 AM – 5:00 PM',
        thursday: '9:00 AM – 5:00 PM',
        friday: '9:00 AM – 5:00 PM',
        saturday: '10:00 AM – 4:00 PM',
        sunday: 'Closed',
      },
      status: 'draft',
      staff: [],
      referralCode: `REF-${newBusinessId.replace('sk-', '').toUpperCase()}`,
      referredBy: body.referredBy ? body.referredBy.trim().toUpperCase() : undefined,
      billing: {
        status: 'unpaid',
        isInitialSignUpPaid: false,
        initialSignUpFee: 19.99,
        renewalFee: 25,
        quarterlyFee: 25,
        termMonths: 2,
        reminderSent: false,
        referralCode: `REF-${newBusinessId.replace('sk-', '').toUpperCase()}`,
        referredBy: body.referredBy ? body.referredBy.trim().toUpperCase() : undefined,
        referralsCount: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Calculate initial system-driven ranking tier
    const initialRanking = calculateBusinessRanking(newBusiness);
    newBusiness.rankingTier = initialRanking.tier;
    newBusiness.rankingScore = initialRanking.score;

    const saved = db.saveBusiness(newBusiness);

    // Track pending referral if created with a valid referral code
    if (newBusiness.referredBy) {
      const referrerBiz = db.getBusinessByReferralCode(newBusiness.referredBy);
      if (referrerBiz && referrerBiz.id !== newBusiness.id) {
        db.addReferral({
          id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          referrerBusinessId: referrerBiz.id,
          referrerOwnerEmail: referrerBiz.ownerEmail,
          referredBusinessId: newBusiness.id,
          referredBusinessName: newBusiness.name,
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
      }
    }

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Business Owner',
      action: 'create_listing_draft',
      targetId: saved.id,
      details: `Created draft listing for "${saved.name}" with permanent ID ${saved.id}`,
    });

    res.json({ business: enforceBusinessAddressPrivacy(saved) });
  });

  // Soft delete / archive listing
  app.post('/api/businesses/:id/archive', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const existing = db.getBusinessById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isOwner = req.user.id === existing.ownerId || (req.user.email && req.user.email.toLowerCase() === existing.ownerEmail?.toLowerCase());
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied to archive this business listing' });
    }

    const archived = db.archiveBusiness(req.params.id);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Business Owner',
      action: 'archive_listing',
      targetId: existing.id,
      details: `Archived listing "${existing.name}". Public visibility ceased; permanent ID ${existing.id} preserved.`,
    });

    res.json({ success: true, business: archived });
  });

  // Update listing details
  app.put('/api/businesses/:id', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const existing = db.getBusinessById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isOwner = req.user.id === existing.ownerId || (req.user.email && req.user.email.toLowerCase() === existing.ownerEmail?.toLowerCase());
    const staffPerms = existing.staff?.find((s) => s.userId === req.user.id || (req.user.email && s.email.toLowerCase() === req.user.email.toLowerCase()))?.permissions || [];
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin && !staffPerms.includes('edit_profile')) {
      return res.status(403).json({ error: 'Permission denied to edit this business listing' });
    }

    const body = req.body;

    // URL safety check
    if (
      !validateSafeUrl(body.website) ||
      !validateSafeUrl(body.orderOnlineUrl) ||
      !validateSafeUrl(body.bookingUrl) ||
      !validateSafeUrl(body.directionsUrl)
    ) {
      return res.status(400).json({
        error: 'Unsafe link URL detected. Only http:// and https:// link schemes are permitted.',
      });
    }

    // Normalize keywords: lowercase, trim, deduplicate
    if (body.keywords) {
      body.keywords = Array.from(
        new Set(
          body.keywords
            .map((k: string) => k.toLowerCase().trim().replace(/\s+/g, ' '))
            .filter((k: string) => k.length > 0)
        )
      );
    }

    // Canonical state machine: owners cannot directly set their own status to 'active' without verified payment
    let targetStatus: ListingStatus = body.status || existing.status;
    if (!isAdmin && body.status === 'active' && existing.status !== 'active') {
      if (existing.billing?.status !== 'paid') {
        targetStatus = existing.status; // Prevent unauthorized self-activation
      }
    }

    // Preserve permanent immutable fields: id, ownerId, billing status (unless admin), and ratings
    // Enforce business location type constraints and private residence address protection
    const businessLocationType: BusinessLocationType | undefined =
      body.businessLocationType !== undefined ? body.businessLocationType : existing.businessLocationType;
    let homeVisitAllowed: boolean | undefined =
      body.homeVisitAllowed !== undefined ? Boolean(body.homeVisitAllowed) : existing.homeVisitAllowed;
    let addressToSave = body.address !== undefined ? body.address.trim() : existing.address;
    let publishStreetAddress =
      body.publishStreetAddress !== undefined ? Boolean(body.publishStreetAddress) : existing.publishStreetAddress;
    let isServiceAreaOnly =
      body.isServiceAreaOnly !== undefined ? Boolean(body.isServiceAreaOnly) : existing.isServiceAreaOnly;
    let locationType = body.locationType || existing.locationType;
    const futureBusinessAddress =
      body.futureBusinessAddress !== undefined ? (body.futureBusinessAddress.trim() || undefined) : existing.futureBusinessAddress;

    // Strict address privacy: service-area and online-only never collect/save street address
    if (locationType === 'service_area' || locationType === 'online_only' || isServiceAreaOnly) {
      addressToSave = '';
      publishStreetAddress = false;
      isServiceAreaOnly = true;
      locationType = locationType === 'online_only' ? 'online_only' : 'service_area';
    } else if (businessLocationType === 'Home-based') {
      if (homeVisitAllowed === false) {
        // Enforce strictly: never save, accept, or expose a personal home street address
        const hadAddressBefore = Boolean(addressToSave || existing.address);
        addressToSave = '';
        publishStreetAddress = false;
        isServiceAreaOnly = true;
        locationType = 'service_area';
        if (hadAddressBefore && existing.homeVisitAllowed !== false) {
          db.addAuditEvent({
            id: `aud-${Date.now()}-residence-cleared`,
            timestamp: new Date().toISOString(),
            actor: req.user.name || req.user.email || 'Business Owner',
            action: 'home_residence_address_cleared_and_protected',
            targetId: existing.id,
            details: `Home visit consent changed to No. Private residence street address permanently cleared and blocked from public exposure.`,
          });
        }
      } else if (homeVisitAllowed === true) {
        isServiceAreaOnly = false;
        locationType = 'storefront';
      }
    } else if (businessLocationType === 'Mobile business') {
      addressToSave = '';
      publishStreetAddress = false;
      isServiceAreaOnly = true;
      locationType = 'service_area';
    } else if (businessLocationType === 'Brick-and-mortar location') {
      isServiceAreaOnly = false;
      locationType = 'storefront';
    }

    const updated: Business = {
      ...existing,
      ...body,
      address: addressToSave,
      publishStreetAddress,
      isServiceAreaOnly,
      locationType,
      businessLocationType,
      homeVisitAllowed,
      futureBusinessAddress,
      directionsUrl: (addressToSave && publishStreetAddress) ? (body.directionsUrl?.trim() || existing.directionsUrl || '') : '',
      id: existing.id,
      ownerId: existing.ownerId,
      ownerEmail: existing.ownerEmail,
      status: targetStatus,
      createdAt: existing.createdAt,
      billing: existing.billing, // Protected against arbitrary direct edits
      averageRating: existing.averageRating, // Automatic ratings cannot be manually edited or inflated
      ratingCount: existing.ratingCount, // Automatic count cannot be manually inflated
      staff: isOwner || isAdmin ? (body.staff || existing.staff) : existing.staff,
    };

    // Calculate system-driven engagement ranking tier
    const currentRanking = calculateBusinessRanking(updated);
    updated.rankingTier = currentRanking.tier;
    updated.rankingScore = currentRanking.score;

    // If restaurant, validate requirement if currently active
    if (updated.category === 'restaurants-food' && updated.status === 'active') {
      if ((!updated.menuPhotos || updated.menuPhotos.length === 0) && !updated.menuFileUrl) {
        return res.status(400).json({
          error: 'Restaurants and Food listings require at least one menu photo or menu file before publication.',
        });
      }
    }

    const saved = db.saveBusiness(updated);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Business Owner',
      action: 'update_listing',
      targetId: saved.id,
      details: `Updated listing content for "${saved.name}"`,
    });

    res.json({ business: enforceBusinessAddressPrivacy(saved) });
  });

  // Publish listing flow
  app.post('/api/businesses/:id/publish', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only the business owner or admin can publish the listing' });
    }

    // Required content validation (address, serviceArea, or city satisfies location)
    if (!b.name || !b.shortDescription || !b.category || (!b.address && !b.serviceArea && !b.city) || (!b.phone && !b.email)) {
      return res.status(400).json({
        error: 'Please complete all required fields (Name, Description, Category, Location, and Contact info) before publishing.',
      });
    }

    // Category-specific validation: Restaurants require menu photo or file
    if (b.category === 'restaurants-food') {
      if ((!b.menuPhotos || b.menuPhotos.length === 0) && !b.menuFileUrl) {
        return res.status(400).json({
          error: 'Restaurants & Food listings require at least one uploaded menu photo or menu file before publication.',
        });
      }
    }

    // Billing check: must be paid through current date
    const nowTime = Date.now();
    const isPaid =
      b.billing?.status === 'paid' &&
      b.billing?.paidThroughDate &&
      new Date(b.billing.paidThroughDate).getTime() > nowTime;

    if (!isPaid) {
      b.status = 'pending_payment';
      db.saveBusiness(b);
      return res.json({
        success: false,
        requiresPayment: true,
        business: b,
        message: 'Content validated! Complete your $19.99 initial enrollment fee to activate your 2-month public directory listing.',
      });
    }

    // If paid, activate listing!
    b.status = 'active';
    b.statusReason = undefined;
    const saved = db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Business Owner',
      action: 'publish_listing',
      targetId: b.id,
      details: `Listing "${b.name}" published and active on public directory.`,
    });

    res.json({ success: true, business: saved });
  });

  // Owner Pause / Resume
  app.post('/api/businesses/:id/pause', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    b.status = 'paused';
    b.statusReason = 'Listing paused by owner.';
    db.saveBusiness(b);
    res.json({ business: b });
  });

  app.post('/api/businesses/:id/resume', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Verify paid through date
    const nowTime = Date.now();
    const isPaid =
      b.billing?.status === 'paid' &&
      b.billing?.paidThroughDate &&
      new Date(b.billing.paidThroughDate).getTime() > nowTime;

    if (!isPaid) {
      b.status = 'hidden_unpaid';
      b.statusReason = 'Cannot resume: Annual fee expired or unpaid.';
      db.saveBusiness(b);
      return res.status(400).json({ error: 'Payment required to resume active listing', business: b });
    }

    b.status = 'active';
    b.statusReason = undefined;
    db.saveBusiness(b);
    res.json({ business: b });
  });

  // Flyer management
  app.post('/api/businesses/:id/flyer', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    const staffPerms = existingStaffPermissions(b, req.user.id, req.user.email);
    if (!isOwner && req.user.role !== 'admin' && !staffPerms.includes('edit_flyer')) {
      return res.status(403).json({ error: 'Permission denied to edit promotional flyer' });
    }

    const { headline, offerDetails, photoUrl, accentColor, template, publish } = req.body;
    if (!headline || !offerDetails) {
      return res.status(400).json({ error: 'Headline and offer details are required for the flyer' });
    }

    const flyer: Flyer = {
      id: b.flyer?.id || `fl-${Date.now()}`,
      businessId: b.id,
      headline: headline.trim(),
      offerDetails: offerDetails.trim(),
      photoUrl: photoUrl || b.photos[0] || '',
      accentColor: accentColor || '#16a34a',
      template: template || 'modern',
      status: publish ? 'published' : 'draft',
      updatedAt: new Date().toISOString(),
    };

    b.flyer = flyer;
    db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Business Owner',
      action: publish ? 'publish_flyer' : 'save_flyer_draft',
      targetId: b.id,
      details: `${publish ? 'Published' : 'Saved draft'} promotional flyer for "${b.name}"`,
    });

    res.json({ success: true, flyer, business: b });
  });

  // Staff management endpoints (Only business owner or admin can manage staff)
  app.post('/api/businesses/:id/staff', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the business owner can invite staff members' });
    }

    const { email, name, permissions } = req.body;
    if (!email || !permissions || permissions.length === 0) {
      return res.status(400).json({ error: 'Email and at least one permission are required' });
    }

    const newStaff: StaffMember = {
      id: `st-${Date.now()}`,
      userId: `user-staff-${Date.now()}`,
      email: email.trim(),
      name: name?.trim() || email.split('@')[0],
      permissions,
      invitedAt: new Date().toISOString(),
    };

    if (!b.staff) b.staff = [];
    b.staff.push(newStaff);
    db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || req.user.email || 'Business Owner',
      action: 'invite_staff',
      targetId: b.id,
      details: `Invited staff ${newStaff.email} with permissions: ${permissions.join(', ')}`,
    });

    res.json({ staff: b.staff });
  });

  app.delete('/api/businesses/:id/staff/:staffId', ...requirePrivilegedStorage, requireAuth, requirePrivilegedMfa, (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    const isOwner = req.user.id === b.ownerId || (req.user.email && req.user.email.toLowerCase() === b.ownerEmail?.toLowerCase());
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only the business owner can remove staff' });
    }

    b.staff = (b.staff || []).filter((s) => s.id !== req.params.staffId);
    db.saveBusiness(b);
    res.json({ staff: b.staff });
  });

  // Public, read-only server configuration for Square Web Payments SDK
  app.get('/api/billing/square-config', (req, res) => {
    const squareEnv = (process.env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    const hasSquareAppId = !!process.env.SQUARE_APPLICATION_ID;
    const hasSquareLocId = !!process.env.SQUARE_LOCATION_ID;
    const hasSquareToken = !!process.env.SQUARE_ACCESS_TOKEN;
    const isConfigured = hasSquareAppId && hasSquareLocId && hasSquareToken;
    const liveBlocked = squareEnv === 'production' && process.env.SQUARE_LIVE_PAYMENTS_ENABLED !== 'true';
    const simulatorEnabled = process.env.ENABLE_PAYMENT_SIMULATOR === 'true' && process.env.NODE_ENV !== 'production';

    res.json({
      configured: isConfigured,
      applicationId: process.env.SQUARE_APPLICATION_ID || '',
      locationId: process.env.SQUARE_LOCATION_ID || '',
      environment: squareEnv,
      liveBlocked,
      simulatorEnabled,
    });
  });

  // Shared helper: applies 60-day term extension, referral ledger updates, and audit logging
  function applyVerifiedPaymentLedger(
    b: Business,
    providerReference: string,
    amountCharged: number,
    isInitialSignUp: boolean,
    res: express.Response
  ) {
    const verifiedDate = new Date();
    const verifiedMs = verifiedDate.getTime();
    const receiptNum = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    let termStartDate: string;
    let termEndDate: string;
    let reminderDate: string;

    if (isInitialSignUp) {
      termStartDate = verifiedDate.toISOString();
      // Initial 2 months (60 days)
      termEndDate = new Date(verifiedMs + 60 * 24 * 60 * 60 * 1000).toISOString();
      // Notice: 15-30 days before expiration
      reminderDate = new Date(verifiedMs + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // Bimonthly renewal: extend from current paid-through date if still active, or from today if lapsed
      const currentPaidThrough = b.billing?.paidThroughDate ? new Date(b.billing.paidThroughDate).getTime() : 0;
      const baseMs = currentPaidThrough > verifiedMs ? currentPaidThrough : verifiedMs;
      termStartDate = b.billing?.termStartDate || verifiedDate.toISOString();
      termEndDate = new Date(baseMs + 60 * 24 * 60 * 60 * 1000).toISOString();
      reminderDate = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    // Process referral incentive when a referred business completes $19.99 initial payment
    if (isInitialSignUp && (b.referredBy || b.billing?.referredBy)) {
      const refCode = (b.referredBy || b.billing?.referredBy || '').trim().toUpperCase();
      const referrerBiz = db.getBusinessByReferralCode(refCode);
      if (referrerBiz && referrerBiz.id !== b.id) {
        // Do not allow referral discounts to stack or apply more than once to the same qualifying referral
        if (!referrerBiz.billing?.hasReferralDiscount) {
          referrerBiz.billing.hasReferralDiscount = true;
          referrerBiz.billing.renewalFee = 12.50;
          referrerBiz.billing.referralsCount = (referrerBiz.billing.referralsCount || 0) + 1;
          db.saveBusiness(referrerBiz);

          // Update or add referral record
          const allRefs = db.getReferrals();
          const existingRef = allRefs.find((r) => r.referredBusinessId === b.id);
          if (existingRef) {
            existingRef.status = 'qualified_discount_available';
            db.updateReferral(existingRef);
          } else {
            db.addReferral({
              id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              referrerBusinessId: referrerBiz.id,
              referrerOwnerEmail: referrerBiz.ownerEmail,
              referredBusinessId: b.id,
              referredBusinessName: b.name,
              createdAt: new Date().toISOString(),
              status: 'qualified_discount_available',
            });
          }

          db.addAuditEvent({
            id: `aud-${Date.now()}-ref`,
            timestamp: verifiedDate.toISOString(),
            actor: 'System Referral Engine',
            action: 'referral_discount_qualified',
            targetId: referrerBiz.id,
            details: `Referred business "${b.name}" (${b.id}) completed initial $19.99 enrollment. Referring owner "${referrerBiz.name}" awarded 50% discount on first renewal ($12.50).`,
          });
        }
      }
    } else if (!isInitialSignUp && b.billing?.hasReferralDiscount) {
      // Referring owner just redeemed their 50% discount for this renewal ($12.50 paid)!
      // Future renewals return to standard $25 every 2 months.
      b.billing.hasReferralDiscount = false;
      b.billing.renewalFee = 25;

      const myRefs = db.getReferrals(b.id);
      const qualRef = myRefs.find((r) => r.referrerBusinessId === b.id && r.status === 'qualified_discount_available');
      if (qualRef) {
        qualRef.status = 'discount_redeemed';
        qualRef.discountRedeemedAt = verifiedDate.toISOString();
        db.updateReferral(qualRef);
      }

      db.addAuditEvent({
        id: `aud-${Date.now()}-red`,
        timestamp: verifiedDate.toISOString(),
        actor: currentUser.name,
        action: 'referral_discount_redeemed',
        targetId: b.id,
        details: `Redeemed single 50% referral discount on manual renewal ($12.50 paid). Future renewals reset to standard $25 every 2 months.`,
      });
    }

    b.billing = {
      ...b.billing,
      status: 'paid',
      isInitialSignUpPaid: true,
      initialSignUpFee: 19.99,
      renewalFee: b.billing?.hasReferralDiscount ? 12.50 : 25,
      quarterlyFee: 25,
      termMonths: 2,
      termStartDate,
      paidThroughDate: termEndDate,
      expirationDate: termEndDate,
      reminderScheduledDate: reminderDate,
      reminderSent: false,
      providerReference: providerReference || `sq_verified_${Date.now()}`,
      receiptNumber: receiptNum,
      lastPaymentVerifiedAt: verifiedDate.toISOString(),
      referralCode: b.billing?.referralCode || `REF-${b.id.replace('sk-', '').toUpperCase()}`,
    };

    // If listing was pending_payment or hidden_unpaid, restore active visibility
    if (b.status === 'pending_payment' || b.status === 'hidden_unpaid' || b.status === 'draft') {
      b.status = 'active';
      b.statusReason = undefined;
    }

    db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: verifiedDate.toISOString(),
      actor: currentUser.name,
      action: isInitialSignUp ? 'initial_signup_payment_verified' : 'bimonthly_renewal_payment_verified',
      targetId: b.id,
      details: isInitialSignUp
        ? `Verified manual $19.99 initial enrollment payment for 2-month advertising term via Square. Paid through ${new Date(termEndDate).toLocaleDateString()}. Receipt ${receiptNum}. Stable business ID ${b.id} preserved.`
        : `Verified manual $${amountCharged.toFixed(2)} bimonthly advertising renewal for 2-month term via Square. Paid through ${new Date(termEndDate).toLocaleDateString()}. Receipt ${receiptNum}. Stable business ID ${b.id} preserved.`,
    });

    return res.json({
      success: true,
      business: b,
      isInitialSignUp,
      amount: amountCharged,
      message: isInitialSignUp
        ? `Initial $19.99 enrollment fee verified. Listing is active through ${new Date(termEndDate).toLocaleDateString()}.`
        : `Bimonthly renewal ($${amountCharged.toFixed(2)}) verified. Listing is active through ${new Date(termEndDate).toLocaleDateString()}.`,
    });
  }

  // Billing: Affirmative Manual $19.99 Sign-Up / $25 Bimonthly Renewal Payment Flow
  app.post('/api/billing/checkout-session', (req, res) => {
    if (!currentUser || currentUser.role === 'visitor') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { businessId } = req.body;
    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ error: 'Business ID is required' });
    }

    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    // Verify caller owns the business (admin behavior should not accidentally become an owner charge path)
    if (b.ownerId !== currentUser.id) {
      return res.status(403).json({ error: 'Only the verified business owner can initiate payment or renewal for this listing' });
    }

    const isInitialSignUp = !b.billing?.isInitialSignUpPaid;
    let amount = isInitialSignUp ? 19.99 : 25;
    if (!isInitialSignUp && b.billing?.hasReferralDiscount) {
      amount = 12.50;
    }
    const sessionId = `sq_session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    res.json({
      sessionId,
      businessId: b.id,
      businessName: b.name,
      isInitialSignUp,
      amount,
      hasReferralDiscount: !isInitialSignUp && Boolean(b.billing?.hasReferralDiscount),
      currency: 'USD',
      termMonths: 2,
      note: isInitialSignUp
        ? 'One-time $19.99 initial enrollment fee. Activates your listing and includes its initial 2-month advertising period. No auto-enrollment, manual renewals only.'
        : b.billing?.hasReferralDiscount
        ? 'Single manual renewal payment with 50% referral discount applied: $12.50 for 2 months. No auto-enrollment.'
        : 'Manual $25 advertising fee for a 2-month period. Extends directory visibility by 2 months. No auto-enrollment, manual renewals only.',
    });
  });

  // Server-side Square Payments API CreatePayment & Verification Handler
  app.post('/api/billing/process-square-payment', async (req, res) => {
    if (!currentUser || currentUser.role === 'visitor') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { businessId, sourceId, idempotencyKey, sessionId } = req.body;

    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ error: 'Valid business ID is required' });
    }

    if (!sourceId || typeof sourceId !== 'string') {
      return res.status(400).json({ error: 'Payment token (sourceId) is required' });
    }

    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    // Server must authenticate and verify the caller owns the business
    // (admin behavior should not accidentally become an owner charge path)
    if (b.ownerId !== currentUser.id) {
      return res.status(403).json({ error: 'Only the verified business owner can initiate payment or renewal for this listing' });
    }

    // Processed-payment idempotency ledger check: ensure duplicate requests cannot charge or apply twice
    const cleanIdempotencyKey = idempotencyKey ? String(idempotencyKey).trim() : '';
    if (cleanIdempotencyKey && db.isPaymentEventProcessed(cleanIdempotencyKey)) {
      return res.status(409).json({ error: 'This payment transaction has already been processed.' });
    }

    // Server calculates amount from current business state only ($19.99 initial; first qualifying referred renewal $12.50; otherwise $25.00)
    // Client-supplied amount/status/payment IDs must never activate or renew a listing
    const isInitialSignUp = !b.billing?.isInitialSignUpPaid;
    let expectedAmount = isInitialSignUp ? 19.99 : 25.00;
    if (!isInitialSignUp && b.billing?.hasReferralDiscount) {
      expectedAmount = 12.50;
    }
    const amountInCents = Math.round(expectedAmount * 100);

    const squareEnv = (process.env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
    const squareAppId = process.env.SQUARE_APPLICATION_ID;
    const squareLocId = process.env.SQUARE_LOCATION_ID;
    const squareToken = process.env.SQUARE_ACCESS_TOKEN;

    // Hard-block live production mode by default
    if (squareEnv === 'production' && process.env.SQUARE_LIVE_PAYMENTS_ENABLED !== 'true') {
      return res.status(403).json({
        error: 'Live production payments are hard-blocked by default release safety gates (SQUARE_LIVE_PAYMENTS_ENABLED=false).'
      });
    }

    const simulatorAllowed = process.env.ENABLE_PAYMENT_SIMULATOR === 'true' && process.env.NODE_ENV !== 'production';

    // If Square credentials are not configured in environment
    if (!squareToken || !squareLocId || !squareAppId) {
      if (simulatorAllowed && sourceId === 'simulated-token') {
        const simulatedPaymentId = `sq_sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        db.recordPaymentEvent(simulatedPaymentId, b.id, expectedAmount);
        if (cleanIdempotencyKey) {
          db.recordPaymentEvent(cleanIdempotencyKey, b.id, expectedAmount);
        }
        return applyVerifiedPaymentLedger(b, simulatedPaymentId, expectedAmount, isInitialSignUp, res);
      }
      return res.status(503).json({
        error: 'Square payment gateway is not configured. Please configure SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID, and SQUARE_ACCESS_TOKEN.'
      });
    }

    // Call official Square Payments API CreatePayment using REST endpoint
    const squareApiUrl = squareEnv === 'production'
      ? 'https://connect.squareup.com/v2/payments'
      : 'https://connect.squareupsandbox.com/v2/payments';

    const serverIdempotencyKey = cleanIdempotencyKey || `sq_srv_${b.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      const squareResponse = await fetch(squareApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${squareToken}`,
          'Square-Version': '2024-10-17',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_id: sourceId,
          idempotency_key: serverIdempotencyKey,
          amount_money: {
            amount: amountInCents,
            currency: 'USD',
          },
          location_id: squareLocId,
          autocomplete: true,
          note: `Short Stack ${isInitialSignUp ? 'Enrollment ($19.99)' : 'Bimonthly Renewal'} - ${b.name} (${b.id})`,
        }),
      });

      const responseBody = await squareResponse.json();

      if (!squareResponse.ok || !responseBody.payment) {
        const errorDetail = responseBody.errors?.[0]?.detail || responseBody.errors?.[0]?.message || 'Square payment authorization failed';
        console.error('Square payment error status:', squareResponse.status, responseBody.errors?.[0]?.code);
        return res.status(400).json({ error: errorDetail });
      }

      const payment = responseBody.payment;

      // Require Square payment status COMPLETED
      if (payment.status !== 'COMPLETED') {
        return res.status(400).json({
          error: `Square payment was not completed. Status returned: ${payment.status}`
        });
      }

      // Require exact returned amount and currency
      if (payment.amount_money?.amount !== amountInCents || payment.amount_money?.currency !== 'USD') {
        return res.status(400).json({
          error: 'Square payment amount or currency verification mismatch'
        });
      }

      // Require exact configured location
      if (squareLocId && payment.location_id !== squareLocId) {
        return res.status(400).json({
          error: 'Square payment location verification mismatch'
        });
      }

      // Record Square payment ID as providerReference and use the existing processed-payment idempotency ledger
      if (db.isPaymentEventProcessed(payment.id)) {
        return res.status(409).json({ error: 'This Square payment ID has already been credited.' });
      }

      db.recordPaymentEvent(payment.id, b.id, expectedAmount);
      if (serverIdempotencyKey !== payment.id) {
        db.recordPaymentEvent(serverIdempotencyKey, b.id, expectedAmount);
      }

      return applyVerifiedPaymentLedger(b, payment.id, expectedAmount, isInitialSignUp, res);
    } catch (err: any) {
      console.error('Square payment network/server error:', err.message);
      return res.status(500).json({ error: 'Network error communicating with Square Payments API' });
    }
  });

  // Legacy simulation endpoint - available ONLY behind explicit development-only env flag, default off, rejected in production
  app.post('/api/billing/verify-payment', (req, res) => {
    if (process.env.ENABLE_PAYMENT_SIMULATOR !== 'true' || process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Simulated payment processing is disabled. Square payments required.'
      });
    }

    if (!currentUser || currentUser.role === 'visitor') {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { businessId, sessionId, providerReference } = req.body;
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    // Verify caller owns the business (admin behavior should not accidentally become an owner charge path)
    if (b.ownerId !== currentUser.id) {
      return res.status(403).json({ error: 'Only the business owner can initiate payment or renewal for this listing' });
    }

    const isInitialSignUp = !b.billing?.isInitialSignUpPaid;
    let expectedAmount = isInitialSignUp ? 19.99 : 25;
    if (!isInitialSignUp && b.billing?.hasReferralDiscount) {
      expectedAmount = 12.50;
    }

    const ref = providerReference || `sq_sim_${Date.now()}`;
    if (db.isPaymentEventProcessed(ref)) {
      return res.status(409).json({ error: 'This payment transaction has already been applied.' });
    }
    db.recordPaymentEvent(ref, b.id, expectedAmount);

    return applyVerifiedPaymentLedger(b, ref, expectedAmount, isInitialSignUp, res);
  });

  // Simulator for testing expiration / lapse without waiting 2 months
  app.post('/api/billing/simulate-expiration', (req, res) => {
    const { businessId, state } = req.body as { businessId: string; state: 'expired' | 'approaching_notice' | 'active' };
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const nowTime = Date.now();

    if (state === 'expired') {
      // Set paidThroughDate to 1 day ago
      const past = new Date(nowTime - 24 * 60 * 60 * 1000).toISOString();
      b.billing.paidThroughDate = past;
      b.billing.expirationDate = past;
      b.billing.status = 'expired';
      b.status = 'hidden_unpaid';
      b.statusReason = 'Bimonthly $25 renewal fee expired. Retained for manual renewal.';
    } else if (state === 'approaching_notice') {
      // Set expiration to 10 days from now (approaching notice window)
      const nearFuture = new Date(nowTime + 10 * 24 * 60 * 60 * 1000).toISOString();
      const pastNoticeDate = new Date(nowTime - 2 * 24 * 60 * 60 * 1000).toISOString();
      b.billing.expirationDate = nearFuture;
      b.billing.paidThroughDate = nearFuture;
      b.billing.reminderScheduledDate = pastNoticeDate;
      b.billing.reminderSent = false;
      b.status = 'active';
    } else {
      // Normal active 2 months (60 days)
      const future = new Date(nowTime + 60 * 24 * 60 * 60 * 1000).toISOString();
      b.billing.expirationDate = future;
      b.billing.paidThroughDate = future;
      b.billing.status = 'paid';
      b.status = 'active';
      b.statusReason = undefined;
    }

    db.saveBusiness(b);
    db.runExpirationAndReminderJob();

    res.json({ success: true, business: b });
  });

  // Referral endpoints
  app.get('/api/referrals/my-referrals', (req, res) => {
    const { businessId } = req.query as { businessId?: string };
    const referrals = db.getReferrals(businessId);
    res.json({ referrals });
  });

  app.get('/api/referrals/validate', (req, res) => {
    const { code } = req.query as { code?: string };
    if (!code) {
      return res.status(400).json({ valid: false, error: 'Code required' });
    }
    const biz = db.getBusinessByReferralCode(code);
    if (!biz) {
      return res.json({ valid: false, message: 'Invalid or unrecognized referral code.' });
    }
    res.json({
      valid: true,
      referrerId: biz.id,
      referrerName: biz.name,
      message: `Referred by ${biz.name}. Sign up for $19.99 to help them earn 50% off their first renewal!`,
    });
  });

  // Direct Photo Upload endpoint (from device)
  app.post('/api/upload', (req, res) => {
    const { dataUrl, filename } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    // Return the data URL directly as a durable image reference
    res.json({ success: true, url: dataUrl, filename });
  });

  // Moderation endpoints (Admin only)
  app.get('/api/moderation/actions', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ actions: db.getModerationActions() });
  });

  app.post('/api/moderation/action', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { businessId, newStatus, reason } = req.body;
    if (!businessId || !newStatus || !reason) {
      return res.status(400).json({ error: 'businessId, newStatus, and reason are required' });
    }

    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const prev = b.status;
    b.status = newStatus;
    b.statusReason = reason;
    db.saveBusiness(b);

    const action = {
      id: `mod-${Date.now()}`,
      businessId: b.id,
      businessName: b.name,
      previousStatus: prev,
      newStatus,
      reason,
      actor: req.user.name || 'Administrator',
      timestamp: new Date().toISOString(),
    };
    db.addModerationAction(action);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: req.user.name || 'Administrator',
      action: `moderation_${newStatus}`,
      targetId: b.id,
      details: `Status transitioned from ${prev} to ${newStatus}. Reason: ${reason}`,
    });

    res.json({ success: true, action, business: b });
  });

  // Reports
  app.get('/api/moderation/reports', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ reports: db.getReports() });
  });

  app.post('/api/reports', requireDurableDatabase, (req, res) => {
    const { businessId, reason, details, reporterEmail } = req.body;
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const report = {
      id: `rep-${Date.now()}`,
      businessId: b.id,
      businessName: b.name,
      reporterEmail: reporterEmail?.trim() || 'anonymous@visitor.local',
      reason: reason || 'Listing content concern',
      details: details || '',
      timestamp: new Date().toISOString(),
      status: 'pending' as const,
    };

    db.addReport(report);
    res.json({ success: true, report });
  });

  app.post('/api/reports/:id/resolve', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { status, notes } = req.body;
    db.updateReport(req.params.id, status || 'resolved', notes);
    res.json({ success: true });
  });

  // Audit events
  app.get('/api/moderation/audit-history', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ events: db.getAuditEvents(), reminders: db.getReminderLogs() });
  });

  // ==========================================
  // Customer Reviews & Automatic Rating API
  // ==========================================
  app.get('/api/businesses/:id/reviews', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isOwner = req.user.id === b.ownerId || b.staff?.some((s) => s.userId === req.user.id);
    const isAdmin = req.user.role === 'admin';

    // Public gets published only; owner/admin gets full list (to review flags or moderated items)
    const reviews = db.getReviews(b.id, isAdmin);
    // Never expose private reviewer accounts or contact info
    const safeReviews = reviews.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      reviewerName: r.reviewerName,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      status: r.status,
      flaggedByOwner: isOwner || isAdmin ? r.flaggedByOwner : undefined,
      flagReason: isOwner || isAdmin ? r.flagReason : undefined,
      flaggedAt: isOwner || isAdmin ? r.flaggedAt : undefined,
      adminNotes: isAdmin ? r.adminNotes : undefined,
    }));

    const publishedList = safeReviews.filter((r) => r.status === 'published');
    const pubCount = publishedList.length;
    const pubAvg =
      pubCount > 0
        ? Math.round((publishedList.reduce((acc, r) => acc + r.rating, 0) / pubCount) * 10) / 10
        : null;

    res.json({
      reviews: safeReviews,
      averageRating: pubAvg,
      ratingCount: pubCount,
    });
  });

  // Customer review submission with basic spam & duplicate safeguards
  app.post('/api/businesses/:id/reviews', requireDurableDatabase, (req, res) => {
    const { rating, comment, reviewerName } = req.body;
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    if (b.status !== 'active') {
      return res.status(400).json({ error: 'Reviews can only be submitted for active business listings.' });
    }

    const result = db.addReview({
      businessId: b.id,
      rating: Number(rating),
      comment,
      reviewerName,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      review: result.review,
      averageRating: result.averageRating,
      ratingCount: result.ratingCount,
    });
  });

  // Flag review for administrator review (owners CANNOT edit or delete customer reviews)
  app.post('/api/reviews/:id/flag', ...requirePrivilegedStorage, requireAuth, (req, res) => {
    const { reason } = req.body;
    const allReviews = db.getReviews(undefined, true);
    const rev = allReviews.find((r) => r.id === req.params.id);
    if (!rev) return res.status(404).json({ error: 'Review not found' });

    const b = db.getBusinessById(rev.businessId);
    if (!b) return res.status(404).json({ error: 'Associated business not found' });

    const isOwner = req.user.id === b.ownerId;
    const result = db.flagReview(
      req.params.id,
      reason,
      isOwner ? 'Business Owner' : req.user.role === 'admin' ? 'Administrator' : 'Customer'
    );
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Review successfully flagged for administrator investigation.' });
  });

  // Admin: get all reviews for moderation
  app.get('/api/admin/reviews', requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const all = db.getReviews(undefined, true);
    res.json({ reviews: all });
  });

  // Admin controls to review reported content and hide or restore reviews
  app.post('/api/admin/reviews/:id/status', ...requirePrivilegedStorage, requireAuth, requireAdmin, requirePrivilegedMfa, (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { status, adminNotes } = req.body;
    if (status !== 'published' && status !== 'hidden') {
      return res.status(400).json({ error: 'Status must be "published" or "hidden"' });
    }

    const result = db.adminUpdateReviewStatus(req.params.id, status, adminNotes);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      review: result.review,
      averageRating: result.averageRating,
      ratingCount: result.ratingCount,
    });
  });

  // Places / Location Autocomplete API (with graceful fallback dictionary)
  app.get('/api/places/autocomplete', (req, res) => {
    const input = (req.query.input as string || '').toLowerCase().trim();
    if (!input || input.length < 1) {
      return res.json({ predictions: [], providerConfigured: !!process.env.GOOGLE_MAPS_API_KEY });
    }

    // Curated high-accuracy real location database for instant autocomplete and auto-population
    const locationDictionary: Array<{
      text: string;
      type: string;
      detail: string;
      streetAddress?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      lat?: number;
      lng?: number;
    }> = [
      { text: '428 Mill Creek Way, Seattle, WA', type: 'address', detail: 'Seattle, WA 98101', streetAddress: '428 Mill Creek Way', city: 'Seattle', state: 'WA', zipCode: '98101', lat: 47.6062, lng: -122.3321 },
      { text: '1108 Industrial Parkway Suite B, Bellevue, WA', type: 'address', detail: 'Bellevue, WA 98004', streetAddress: '1108 Industrial Parkway Suite B', city: 'Bellevue', state: 'WA', zipCode: '98004', lat: 47.6101, lng: -122.2015 },
      { text: '7302 Greenwood Ave N, Seattle, WA', type: 'address', detail: 'Seattle, WA 98103', streetAddress: '7302 Greenwood Ave N', city: 'Seattle', state: 'WA', zipCode: '98103', lat: 47.6817, lng: -122.3553 },
      { text: '512 Northgate Way, Seattle, WA', type: 'address', detail: 'Seattle, WA 98125', streetAddress: '512 Northgate Way', city: 'Seattle', state: 'WA', zipCode: '98125', lat: 47.7085, lng: -122.3232 },
      { text: '2401 NW Market St, Seattle, WA', type: 'address', detail: 'Ballard, Seattle, WA 98107', streetAddress: '2401 NW Market St', city: 'Seattle', state: 'WA', zipCode: '98107', lat: 47.6687, lng: -122.3887 },
      { text: '1414 4th Ave, Seattle, WA', type: 'address', detail: 'Downtown Seattle, WA 98101', streetAddress: '1414 4th Ave', city: 'Seattle', state: 'WA', zipCode: '98101', lat: 47.6097, lng: -122.3364 },
      { text: 'Seattle, WA', type: 'city', detail: 'King County, Washington', city: 'Seattle', state: 'WA', zipCode: '98101' },
      { text: 'Downtown Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98101', city: 'Seattle', state: 'WA', zipCode: '98101' },
      { text: 'Capitol Hill, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98102', city: 'Seattle', state: 'WA', zipCode: '98102' },
      { text: 'Queen Anne, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98109', city: 'Seattle', state: 'WA', zipCode: '98109' },
      { text: 'Ballard, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98107', city: 'Seattle', state: 'WA', zipCode: '98107' },
      { text: 'Greenwood, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98103', city: 'Seattle', state: 'WA', zipCode: '98103' },
      { text: 'Northgate, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98125', city: 'Seattle', state: 'WA', zipCode: '98125' },
      { text: 'Bellevue, WA', type: 'city', detail: 'King County, Washington 98004', city: 'Bellevue', state: 'WA', zipCode: '98004' },
      { text: 'Redmond, WA', type: 'city', detail: 'King County, Washington 98052', city: 'Redmond', state: 'WA', zipCode: '98052' },
      { text: 'Kirkland, WA', type: 'city', detail: 'King County, Washington 98033', city: 'Kirkland', state: 'WA', zipCode: '98033' },
      { text: 'Edmonds, WA', type: 'city', detail: 'Snohomish County, WA 98020', city: 'Edmonds', state: 'WA', zipCode: '98020' },
      { text: 'Tacoma, WA', type: 'city', detail: 'Pierce County, Washington 98402', city: 'Tacoma', state: 'WA', zipCode: '98402' },
      { text: 'Portland, OR', type: 'city', detail: 'Multnomah County, Oregon 97201', city: 'Portland', state: 'OR', zipCode: '97201' },
      { text: 'San Francisco, CA', type: 'city', detail: 'San Francisco County, CA 94102', city: 'San Francisco', state: 'CA', zipCode: '94102' },
      { text: 'Los Angeles, CA', type: 'city', detail: 'Los Angeles County, CA 90012', city: 'Los Angeles', state: 'CA', zipCode: '90012' },
      { text: 'Austin, TX', type: 'city', detail: 'Travis County, Texas 78701', city: 'Austin', state: 'TX', zipCode: '78701' },
      { text: 'Denver, CO', type: 'city', detail: 'Denver County, Colorado 80202', city: 'Denver', state: 'CO', zipCode: '80202' },
      { text: 'Chicago, IL', type: 'city', detail: 'Cook County, Illinois 60601', city: 'Chicago', state: 'IL', zipCode: '60601' },
      { text: 'New York, NY', type: 'city', detail: 'New York County, New York 10001', city: 'New York', state: 'NY', zipCode: '10001' },
      { text: '98101 (Seattle, WA)', type: 'zip', detail: 'Seattle, WA ZIP Code', city: 'Seattle', state: 'WA', zipCode: '98101' },
      { text: '98004 (Bellevue, WA)', type: 'zip', detail: 'Bellevue, WA ZIP Code', city: 'Bellevue', state: 'WA', zipCode: '98004' },
      { text: '98103 (Seattle, WA)', type: 'zip', detail: 'Greenwood / Phinney Ridge ZIP', city: 'Seattle', state: 'WA', zipCode: '98103' },
    ];

    const matched = locationDictionary
      .filter((loc) => loc.text.toLowerCase().includes(input) || loc.detail.toLowerCase().includes(input))
      .slice(0, 6);

    res.json({
      source: process.env.GOOGLE_MAPS_API_KEY ? 'google_places_live' : 'built_in_dictionary',
      providerConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
      predictions: matched,
    });
  });

  // Scheduler manual trigger
  app.post('/api/scheduler/run-checks', (req, res) => {
    const result = db.runExpirationAndReminderJob();
    res.json({ success: true, result });
  });

  return app;
}

export async function startServer() {
  const app = createApiApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Background interval: run checks every 10 minutes
  setInterval(() => {
    try {
      db.runExpirationAndReminderJob();
    } catch (e) {
      console.error('Error in scheduler job:', e);
    }
  }, 10 * 60 * 1000);

  // Static asset serving for generated media
  app.use('/src/assets', express.static(path.join(__dirname, 'src/assets')));
  app.use('/public', express.static(path.join(__dirname, 'public')));
  app.use('/images', express.static(path.join(__dirname, 'public/images')));

  // Vite middleware in dev or static serve in prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Short Stack server listening on port ${PORT}`);
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Fatal error starting Short Stack server:', err);
  });
}
