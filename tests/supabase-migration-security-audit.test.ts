import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createApiApp,
  createSession,
  clearAllSessions,
  resetSessionToVisitor,
} from '../server.ts';
import { db } from '../src/server/db.ts';

describe('Supabase Migration & Auth Security Audit Verification (tests/supabase-migration-security-audit.test.ts)', () => {
  let appServer: any;
  let baseUrl: string;
  let initialDbSnapshot: any;

  const rootMigrationPath = path.resolve(process.cwd(), 'migrations/001_initial_schema_and_rls.sql');
  const serverMigrationPath = path.resolve(process.cwd(), 'src/server/migrations/001_initial_schema_and_rls.sql');

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
      if (typeof appServer.closeAllConnections === 'function') {
        appServer.closeAllConnections();
      }
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
  // 1. Byte-Identical SQL Migration Files
  // ---------------------------------------------------------------------------
  describe('1. Migration File Synchrony', () => {
    test('root migration and src/server migration files are 100% byte-identical', () => {
      assert.ok(fs.existsSync(rootMigrationPath), 'migrations/001_initial_schema_and_rls.sql must exist');
      assert.ok(fs.existsSync(serverMigrationPath), 'src/server/migrations/001_initial_schema_and_rls.sql must exist');

      const rootContent = fs.readFileSync(rootMigrationPath);
      const serverContent = fs.readFileSync(serverMigrationPath);

      assert.equal(
        rootContent.length,
        serverContent.length,
        'Both migration files must have identical byte lengths'
      );

      const rootHash = crypto.createHash('sha256').update(rootContent).digest('hex');
      const serverHash = crypto.createHash('sha256').update(serverContent).digest('hex');

      assert.equal(rootHash, serverHash, 'Both migration files must have identical SHA-256 digests');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Syntax Validation: Schema vs View Projection
  // ---------------------------------------------------------------------------
  describe('2. SQL Schema Integrity & View Projection Validation', () => {
    test('public_businesses_directory view has NO nonexistent catalog reference', () => {
      const sql = fs.readFileSync(rootMigrationPath, 'utf8');

      // Must not reference businesses.catalog or catalog column in view
      const viewDefinitionMatch = sql.match(/CREATE OR REPLACE VIEW public_businesses_directory[\s\S]*?FROM businesses/i);
      assert.ok(viewDefinitionMatch, 'public_businesses_directory view definition must be found');

      const viewSql = viewDefinitionMatch[0];
      assert.doesNotMatch(viewSql, /\bcatalog\b/i, 'View must NOT select nonexistent "catalog" column');
    });

    test('all columns projected by public_businesses_directory exist in businesses table schema', () => {
      const sql = fs.readFileSync(rootMigrationPath, 'utf8');

      // Extract CREATE TABLE businesses definition
      const tableMatch = sql.match(/CREATE TABLE IF NOT EXISTS businesses\s*\(([\s\S]*?)\n\);/i);
      assert.ok(tableMatch, 'businesses table definition must be found');

      const tableLines = tableMatch[1].split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('--'));

      const tableColumnNames = new Set<string>();
      for (const line of tableLines) {
        const colMatch = line.match(/^([a-z_][a-z0-9_]*)\b/i);
        if (colMatch) {
          tableColumnNames.add(colMatch[1].toLowerCase());
        }
      }

      assert.ok(tableColumnNames.has('id'), 'businesses must have id');
      assert.ok(tableColumnNames.has('name'), 'businesses must have name');
      assert.ok(tableColumnNames.has('billing'), 'businesses must have billing');
      assert.ok(tableColumnNames.has('owner_email'), 'businesses must have owner_email');
      assert.equal(tableColumnNames.has('catalog'), false, 'businesses must NOT have catalog column');

      // Check view definition
      const viewMatch = sql.match(/CREATE OR REPLACE VIEW public_businesses_directory[\s\S]*?SELECT([\s\S]*?)FROM businesses/i);
      assert.ok(viewMatch, 'View SELECT clause must be parsed');

      const selectClause = viewMatch[1];

      // Sensitive fields that MUST NOT be projected in public directory
      const prohibitedSensitiveFields = [
        'billing',
        'owner_email',
        'owner_id',
        'staff',
        'engagement',
        'ranking_score',
        'status_reason',
        'future_business_address',
        'admin_notes',
      ];

      for (const field of prohibitedSensitiveFields) {
        // Assert field is not selected directly as a projected column
        const regex = new RegExp(`(^|\\s|,)${field}(\\s|,|$)`, 'i');
        assert.doesNotMatch(
          selectClause,
          regex,
          `Sensitive internal field "${field}" must NEVER be projected in public directory view`
        );
      }
    });

    test('public_businesses_directory is NOT defined with security_invoker = true (standard view allows safe public reads)', () => {
      const sql = fs.readFileSync(rootMigrationPath, 'utf8');
      const viewHeader = sql.match(/CREATE OR REPLACE VIEW public_businesses_directory[\s\S]*?AS\s+SELECT/i);
      assert.ok(viewHeader);
      assert.doesNotMatch(
        viewHeader[0],
        /WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
        'View must NOT use security_invoker = true which breaks anon/public discovery under strict table permissions'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Direct Client Mutation Denial & Table Grants
  // ---------------------------------------------------------------------------
  describe('3. Direct Mutation Denial & Least-Privilege Grants', () => {
    test('direct INSERT, UPDATE, DELETE on businesses is revoked from client roles', () => {
      const sql = fs.readFileSync(rootMigrationPath, 'utf8');

      // Must revoke mutations from anon and authenticated
      assert.match(
        sql,
        /REVOKE\s+ALL\s+ON\s+TABLE\s+businesses\s+FROM\s+anon/i,
        'Must revoke ALL privileges on businesses from anon'
      );
      assert.match(
        sql,
        /REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+businesses\s+FROM\s+authenticated/i,
        'Must revoke INSERT, UPDATE, DELETE on businesses from authenticated'
      );

      // Must not grant unrestricted INSERT or UPDATE to authenticated
      assert.doesNotMatch(
        sql,
        /GRANT\s+.*UPDATE.*ON\s+TABLE\s+businesses\s+TO\s+authenticated/i,
        'Must NOT grant direct table-level UPDATE on businesses to authenticated'
      );
      assert.doesNotMatch(
        sql,
        /GRANT\s+.*INSERT.*ON\s+TABLE\s+businesses\s+TO\s+authenticated/i,
        'Must NOT grant direct table-level INSERT on businesses to authenticated'
      );
    });

    test('user_accounts role and email are immutable to self in RLS and grants', () => {
      const sql = fs.readFileSync(rootMigrationPath, 'utf8');

      // RLS policy check
      assert.match(
        sql,
        /role\s*=\s*\(\s*SELECT\s+u\.role\s+FROM\s+user_accounts\s+u\s+WHERE\s+u\.id\s*=\s*current_auth_uid\(\)\s*\)/i,
        'users_update_own policy must enforce role snapshot immutability'
      );
      assert.match(
        sql,
        /email\s*=\s*\(\s*SELECT\s+u\.email\s+FROM\s+user_accounts\s+u\s+WHERE\s+u\.id\s*=\s*current_auth_uid\(\)\s*\)/i,
        'users_update_own policy must enforce email snapshot immutability'
      );

      // Column-level update restriction
      assert.match(
        sql,
        /GRANT\s+UPDATE\s*\(name\)\s+ON\s+TABLE\s+user_accounts\s+TO\s+authenticated/i,
        'authenticated update grant on user_accounts must be strictly column-restricted to (name)'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Stored Procedure Hardening: flag_review
  // ---------------------------------------------------------------------------
  describe('4. flag_review Function Hardening', () => {
    test('flag_review specifies SET search_path = public and revokes EXECUTE from PUBLIC/anon', () => {
      const sql = fs.readFileSync(rootMigrationPath, 'utf8');

      const funcMatch = sql.match(/CREATE OR REPLACE FUNCTION flag_review[\s\S]*?END;\s*\$\$/i);
      assert.ok(funcMatch, 'flag_review function definition must be found');
      const funcSql = funcMatch[0];

      assert.match(
        funcSql,
        /SECURITY\s+DEFINER/i,
        'flag_review must be SECURITY DEFINER to bypass table write restrictions safely'
      );
      assert.match(
        funcSql,
        /SET\s+search_path\s*=\s*public/i,
        'flag_review must set search_path = public to defend against search path hijacking'
      );

      // Verify function EXECUTE permissions
      assert.match(
        sql,
        /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+flag_review\s*\(\s*TEXT,\s*TEXT\s*\)\s+FROM\s+PUBLIC,\s*anon/i,
        'EXECUTE on flag_review must be revoked from PUBLIC and anon'
      );
      assert.match(
        sql,
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+flag_review\s*\(\s*TEXT,\s*TEXT\s*\)\s+TO\s+authenticated/i,
        'EXECUTE on flag_review must be granted strictly to authenticated'
      );

      // Verify mutation scope: updates only flagged_by_owner, flag_reason, flagged_at
      assert.match(
        funcSql,
        /UPDATE\s+customer_reviews\s+SET\s+flagged_by_owner\s*=\s*TRUE/i,
        'Must set flagged_by_owner'
      );
      assert.doesNotMatch(
        funcSql,
        /UPDATE\s+customer_reviews\s+SET[\s\S]*?\brating\b/i,
        'Must NOT allow mutating rating'
      );
      assert.doesNotMatch(
        funcSql,
        /UPDATE\s+customer_reviews\s+SET[\s\S]*?\bcomment\b/i,
        'Must NOT allow mutating comment'
      );
      assert.doesNotMatch(
        funcSql,
        /UPDATE\s+customer_reviews\s+SET[\s\S]*?\bstatus\b/i,
        'Must NOT allow mutating publication status'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Server Auth Endpoint Hardening: /api/reviews/:id/flag
  // ---------------------------------------------------------------------------
  describe('5. Review Flag Endpoint Authentication Guard', () => {
    test('unauthenticated anonymous request to /api/reviews/:id/flag returns 401 Unauthorized', async () => {
      // First ensure a test review exists
      const targetBiz = db.getBusinesses({ includeInactive: false })[0];
      assert.ok(targetBiz);

      const addRes = await fetch(`${baseUrl}/api/businesses/${targetBiz.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: 4,
          comment: 'Anonymous flag testing review',
          reviewerName: 'Test Reviewer',
        }),
      });
      assert.equal(addRes.status, 200);
      const addData = await addRes.json();
      const reviewId = addData.review.id;

      // Attempt flag without auth header
      const anonFlagRes = await fetch(`${baseUrl}/api/reviews/${reviewId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Competitor spam attempt' }),
      });

      assert.equal(
        anonFlagRes.status,
        401,
        'Anonymous call to /api/reviews/:id/flag must be rejected with 401 Unauthorized'
      );
      const data = await anonFlagRes.json();
      assert.match(data.error, /Unauthorized|authentication token required/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Strict Default AAL1 Handling in createSession
  // ---------------------------------------------------------------------------
  describe('6. AAL2 Default Bypass Elimination', () => {
    test('missing or unspecified AAL in createSession strictly defaults to aal1 regardless of role', () => {
      // Owner without specified AAL
      const ownerSession = createSession({
        id: 'test-owner-no-aal',
        name: 'Test Owner',
        email: 'owner@test.local',
        role: 'owner',
      });
      assert.equal(
        ownerSession.user.aal,
        'aal1',
        'Owner session without verified AAL must default to aal1, never inferred aal2'
      );

      // Admin without specified AAL
      const adminSession = createSession({
        id: 'test-admin-no-aal',
        name: 'Test Admin',
        email: 'admin@seeker.local',
        role: 'admin',
      });
      assert.equal(
        adminSession.user.aal,
        'aal1',
        'Admin session without verified AAL must default to aal1, never inferred aal2'
      );

      // Staff without specified AAL
      const staffSession = createSession({
        id: 'test-staff-no-aal',
        name: 'Test Staff',
        email: 'staff@test.local',
        role: 'staff',
      });
      assert.equal(
        staffSession.user.aal,
        'aal1',
        'Staff session without verified AAL must default to aal1, never inferred aal2'
      );

      // Verified provider AAL2 is strictly preserved
      const verifiedMfaSession = createSession({
        id: 'test-mfa-owner',
        name: 'MFA Owner',
        email: 'mfaowner@test.local',
        role: 'owner',
        aal: 'aal2',
      });
      assert.equal(
        verifiedMfaSession.user.aal,
        'aal2',
        'Explicit provider aal2 must be preserved'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Public Discovery Projection & Address Privacy
  // ---------------------------------------------------------------------------
  describe('7. Public Discovery Field Sanitization', () => {
    test('public GET /api/businesses response strips billing, owner_email, and staff', async () => {
      const res = await fetch(`${baseUrl}/api/businesses`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.businesses));
      assert.ok(data.businesses.length > 0);

      for (const biz of data.businesses) {
        assert.equal(biz.billing, undefined, 'billing must not be exposed');
        assert.equal(biz.ownerEmail, undefined, 'ownerEmail must not be exposed');
        assert.equal(biz.ownerId, undefined, 'ownerId must not be exposed');
        assert.equal(biz.staff, undefined, 'staff roster must not be exposed');
      }
    });
  });
});
