import { createClient, SupabaseClient, type User } from '@supabase/supabase-js';
import type { UserRole, UserAccount } from '../types/pipsqueak.ts';
import { db } from './db.ts';

export interface VerifiedAuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  aal: 'aal1' | 'aal2';
  amr?: Array<{ method: string; timestamp?: number }>;
  rawSupabaseUser?: User;
}

export interface SupabaseConfig {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  anonKey?: string;
  jwtSecret?: string;
}

let serverSupabaseClient: SupabaseClient | null = null;

export function getSupabaseConfig(): SupabaseConfig {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.SUPABASE_ANON_KEY,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
  };
}

export function isSupabaseConfigured(): boolean {
  if (process.env.AUTH_UNCONFIGURED === 'true' || process.env.SUPABASE_UNCONFIGURED === 'true') {
    return false;
  }
  const cfg = getSupabaseConfig();
  if (Boolean(cfg.supabaseUrl && (cfg.serviceRoleKey || cfg.anonKey))) {
    return true;
  }
  if (process.env.NODE_ENV === 'test' && db.isTestModeEnabled()) {
    return true;
  }
  return false;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (serverSupabaseClient) return serverSupabaseClient;

  const cfg = getSupabaseConfig();
  if (!cfg.supabaseUrl || (!cfg.serviceRoleKey && !cfg.anonKey)) {
    return null;
  }

  const keyToUse = cfg.serviceRoleKey || cfg.anonKey!;
  serverSupabaseClient = createClient(cfg.supabaseUrl, keyToUse, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serverSupabaseClient;
}

/**
 * Reset cached client instance (useful in tests when switching env vars)
 */
export function resetSupabaseClient(): void {
  serverSupabaseClient = null;
}

/**
 * Resolves user role strictly from server-controlled configuration and records.
 * NEVER trusts client-submitted role, request body, or user_metadata.
 */
export function resolveServerRoleForUser(email: string, userId?: string): UserRole {
  const cleanEmail = email.toLowerCase().trim();
  const trustedAdminEmails = (process.env.ADMIN_EMAILS || 'admin@seeker.local,admin@shortstack.local')
    .toLowerCase()
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (trustedAdminEmails.includes(cleanEmail)) {
    return 'admin';
  }

  // Check if assigned as staff on any business
  const allBusinesses = db.getBusinesses({ includeInactive: true });
  const isInvitedStaff = allBusinesses.some((b) =>
    b.staff?.some((s) => (userId && s.userId === userId) || s.email.toLowerCase() === cleanEmail)
  );
  if (isInvitedStaff) {
    return 'staff';
  }

  // Check if verified owner of an existing business in database
  const isExistingBusinessOwner = allBusinesses.some(
    (b) => (userId && b.ownerId === userId) || (b.ownerEmail && b.ownerEmail.toLowerCase() === cleanEmail)
  );
  if (isExistingBusinessOwner) {
    return 'owner';
  }

  // Check stored database record if present (e.g. elevated by admin or preserved existing data)
  const existingUser = db.getUserByEmail(cleanEmail);
  if (existingUser?.role === 'admin' && trustedAdminEmails.includes(cleanEmail)) {
    return 'admin';
  }
  if (existingUser?.role === 'staff' && (isInvitedStaff || existingUser.role === 'staff')) {
    return 'staff';
  }
  if (existingUser?.role === 'owner') {
    return 'owner';
  }
  if (existingUser?.role === 'visitor') {
    return 'visitor';
  }

  // New accounts strictly default to least-privilege visitor; no signup path to owner/staff/admin
  return 'visitor';
}

export interface TokenVerificationResult {
  valid: boolean;
  user?: VerifiedAuthUser;
  error?: 'TOKEN_MISSING' | 'INVALID_TOKEN' | 'SUPABASE_UNCONFIGURED' | 'EXPIRED_TOKEN' | 'NETWORK_ERROR';
  details?: string;
}

/**
 * Verifies a Supabase access token server-side.
 * Resolves role strictly through server-controlled records.
 */
export async function verifySupabaseToken(token: string): Promise<TokenVerificationResult> {
  if (!token || !token.trim()) {
    return { valid: false, error: 'TOKEN_MISSING', details: 'No authentication token provided.' };
  }

  const cleanToken = token.trim();

  if (!isSupabaseConfigured()) {
    return {
      valid: false,
      error: 'SUPABASE_UNCONFIGURED',
      details: 'Supabase authentication service is not configured on the server.',
    };
  }

  // Test mode mock tokens for deterministic testing without external cloud network calls
  if (process.env.NODE_ENV === 'test' || db.isTestModeEnabled()) {
    if (cleanToken.startsWith('mock-supabase-') || cleanToken.startsWith('test-token-')) {
      return parseTestMockToken(cleanToken);
    }
  }

  const client = getSupabaseClient();
  if (!client) {
    if (process.env.NODE_ENV === 'test' || db.isTestModeEnabled()) {
      return {
        valid: false,
        error: 'INVALID_TOKEN',
        details: 'Invalid authentication token in test environment.',
      };
    }
    return {
      valid: false,
      error: 'SUPABASE_UNCONFIGURED',
      details: 'Failed to initialize Supabase server client.',
    };
  }

  try {
    const { data, error } = await client.auth.getUser(cleanToken);
    if (error || !data.user) {
      return {
        valid: false,
        error: 'INVALID_TOKEN',
        details: error?.message || 'Token could not be verified by Supabase Auth authority.',
      };
    }

    const sbUser = data.user;
    const email = sbUser.email || '';
    if (!email) {
      return {
        valid: false,
        error: 'INVALID_TOKEN',
        details: 'Supabase user has no associated verified email address.',
      };
    }

    // Determine Authenticator Assurance Level (AAL)
    // Supabase sets app_metadata.aal or amr list on MFA-verified sessions
    let aal: 'aal1' | 'aal2' = 'aal1';
    const amr = (sbUser.app_metadata?.amr as Array<{ method: string; timestamp?: number }>) || [];
    const hasMfaMethod = amr.some((m) => ['totp', 'mfa', 'webauthn'].includes(m.method));
    const tokenAal = sbUser.app_metadata?.aal || (sbUser as any).aal;

    if (tokenAal === 'aal2' || hasMfaMethod) {
      aal = 'aal2';
    }

    // Role is strictly derived from server-side rules; ignore any client-controlled metadata
    const trustedRole = resolveServerRoleForUser(email, sbUser.id);

    // Sync or retrieve user in local db
    let userAccount = db.getUserByEmail(email);
    if (!userAccount) {
      userAccount = db.saveUser({
        id: sbUser.id,
        email,
        name: (sbUser.user_metadata?.name as string) || email.split('@')[0],
        role: trustedRole,
        createdAt: sbUser.created_at || new Date().toISOString(),
      });
    } else {
      userAccount.role = trustedRole;
      if (userAccount.id !== sbUser.id) {
        // preserve link to Supabase UUID
        userAccount.id = sbUser.id;
      }
      db.saveUser(userAccount);
    }

    return {
      valid: true,
      user: {
        id: sbUser.id,
        email,
        name: userAccount.name || email.split('@')[0],
        role: trustedRole,
        aal,
        amr,
        rawSupabaseUser: sbUser,
      },
    };
  } catch (err: any) {
    return {
      valid: false,
      error: 'NETWORK_ERROR',
      details: err?.message || 'Error communicating with Supabase Auth authority.',
    };
  }
}

/**
 * Parser for mock tokens used in automated test suites
 * Format: mock-supabase-{role}-{userId}-{email}-{aal}
 * Example: mock-supabase-owner-user-owner-1-owner@test.local-aal2
 */
function parseTestMockToken(token: string): TokenVerificationResult {
  try {
    const isAal2 = token.includes('aal2');
    const aal: 'aal1' | 'aal2' = isAal2 ? 'aal2' : 'aal1';

    let userId = 'test-user-1';
    const uidMatch = token.match(/uid:([a-zA-Z0-9_-]+)/);
    if (uidMatch) {
      userId = uidMatch[1];
    } else {
      const stdUidMatch = token.match(/(user-[a-zA-Z0-9]+-[0-9]+)/);
      if (stdUidMatch) {
        userId = stdUidMatch[1];
      }
    }

    let email = 'test@example.com';
    const emailMatch = token.match(/email:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      email = emailMatch[1];
    } else if (token.includes('admin')) {
      email = 'admin@seeker.local';
    } else if (token.includes('staff')) {
      email = 'staff@example.com';
    } else if (token.includes('owner')) {
      const biz = db.getBusinesses({ includeInactive: true }).find((b) => b.ownerId === userId);
      email = biz?.ownerEmail || 'owner@example.com';
    }

    // Resolve role strictly via server logic
    const trustedRole = resolveServerRoleForUser(email, userId);

    return {
      valid: true,
      user: {
        id: userId,
        email,
        name: email.split('@')[0],
        role: trustedRole,
        aal,
        amr: isAal2 ? [{ method: 'totp', timestamp: Date.now() }] : [{ method: 'password', timestamp: Date.now() }],
      },
    };
  } catch (e: any) {
    return { valid: false, error: 'INVALID_TOKEN', details: e.message };
  }
}
