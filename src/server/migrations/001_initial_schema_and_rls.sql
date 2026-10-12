-- ============================================================================
-- Short Stack / PipSqueak Production Database Migration
-- Version: 001_initial_schema_and_rls.sql
-- Description: Creates relational tables, indexes, constraints, and Row-Level
--              Security (RLS) policies for production Supabase / PostgreSQL.
--              Compatible with existing empty Supabase project (0 tables).
--              Non-destructive: No DROP, TRUNCATE, or DELETE statements.
--              Preserves existing string IDs (e.g., 'sk-2rn7bf7z', 'user-owner-1').
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. USERS TABLE (Supabase Auth owns user passwords; no password hashes or salts stored)
-- New accounts strictly default to least-privilege 'visitor' role.
CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'visitor' CHECK (role IN ('visitor', 'owner', 'staff', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  subcategories JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_menu BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. BUSINESSES TABLE
CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE RESTRICT,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('sole_proprietorship', 'llc', 'corporation', 'partnership', 'other')),
  short_description TEXT NOT NULL,
  category TEXT NOT NULL,
  custom_category TEXT,
  subcategory TEXT,
  custom_subcategory TEXT,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Location & Privacy attributes
  business_location_type TEXT CHECK (business_location_type IN ('Home-based', 'Mobile business', 'Brick-and-mortar location')),
  home_visit_allowed BOOLEAN,
  future_business_address TEXT,
  location_type TEXT NOT NULL DEFAULT 'storefront' CHECK (location_type IN ('storefront', 'service_area', 'online_only')),
  is_service_area_only BOOLEAN NOT NULL DEFAULT FALSE,
  publish_street_address BOOLEAN NOT NULL DEFAULT TRUE,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'WA',
  zip_code TEXT,
  service_area TEXT,
  directions_url TEXT,

  -- Contact & Web
  phone TEXT,
  email TEXT,
  website TEXT,
  order_online_url TEXT,
  booking_url TEXT,
  logo_url TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  menu_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  menu_file_url TEXT,
  menu_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  hours JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Status & Lifecycle
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('active', 'pending_payment', 'suspended', 'rejected', 'archived', 'hidden_unpaid')),
  status_reason TEXT,
  average_rating NUMERIC(3, 1),
  rating_count INTEGER NOT NULL DEFAULT 0,

  -- Staff Roster
  staff JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Billing & Term Details (Short Stack v2.4+: $19.99 initial enrollment, $25 every 2 months)
  billing JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Engagement & Ranking
  engagement JSONB NOT NULL DEFAULT '{}'::jsonb,
  ranking_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ranking_tier TEXT NOT NULL DEFAULT 'Silver' CHECK (ranking_tier IN ('Diamond', 'Platinum', 'Gold', 'Silver')),

  -- Flyer
  flyer JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. CUSTOMER REVIEWS TABLE
CREATE TABLE IF NOT EXISTS customer_reviews (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  flagged_by_owner BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason TEXT,
  flagged_at TIMESTAMPTZ,
  admin_notes TEXT
);

-- 6. MODERATION ACTIONS TABLE
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. BUSINESS REPORTS TABLE
CREATE TABLE IF NOT EXISTS business_reports (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolution_notes TEXT
);

-- 8. AUDIT EVENTS TABLE
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL
);

-- 9. REMINDERS TABLE
CREATE TABLE IF NOT EXISTS reminder_logs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  expiration_date TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_status TEXT NOT NULL,
  message TEXT NOT NULL
);

-- 10. REFERRALS TABLE
CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  referrer_name TEXT NOT NULL,
  referred_business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  referred_name TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discount_applied NUMERIC(10, 2) NOT NULL DEFAULT 12.50,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired'))
);

-- 11. PAYMENT EVENTS IDEMPOTENCY LEDGER TABLE
CREATE TABLE IF NOT EXISTS processed_payment_events (
  event_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. DURABLE SHARED SESSIONS TABLE
CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  csrf_token TEXT NOT NULL
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES & VIEWS
-- ============================================================================

-- Helper: resolves current authenticated user ID from Supabase Auth JWT claim
CREATE OR REPLACE FUNCTION current_auth_uid() RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid WHERE pg_namespace.nspname = 'auth' AND proname = 'uid') THEN
    RETURN auth.uid()::text;
  END IF;
  RETURN current_setting('request.jwt.claim.sub', true);
EXCEPTION WHEN OTHERS THEN
  RETURN current_setting('request.jwt.claim.sub', true);
END;
$$;

-- Enable RLS on all tables
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;

-- 1. USER_ACCOUNTS:
-- Users can only read their own user record.
CREATE POLICY users_read_own ON user_accounts
  FOR SELECT
  USING (id = current_auth_uid());

-- Users can only update their own record and CANNOT elevate their role or alter auth email.
-- Both USING and WITH CHECK are enforced. Role and email modifications are server/admin-only via service role.
CREATE POLICY users_update_own ON user_accounts
  FOR UPDATE
  USING (id = current_auth_uid())
  WITH CHECK (
    id = current_auth_uid()
    AND role = (SELECT u.role FROM user_accounts u WHERE u.id = current_auth_uid())
    AND email = (SELECT u.email FROM user_accounts u WHERE u.id = current_auth_uid())
  );

REVOKE ALL ON TABLE user_accounts FROM anon;
REVOKE INSERT, DELETE ON TABLE user_accounts FROM authenticated;
GRANT SELECT ON TABLE user_accounts TO authenticated;
GRANT UPDATE (name) ON TABLE user_accounts TO authenticated;

-- 2. CATEGORIES:
-- Public can read non-archived categories. Mutation is server/service_role only.
CREATE POLICY categories_public_select ON categories
  FOR SELECT
  USING (is_archived = FALSE);

REVOKE INSERT, UPDATE, DELETE ON TABLE categories FROM anon, authenticated;
GRANT SELECT ON TABLE categories TO anon, authenticated;

-- 3. BUSINESSES:
-- Raw businesses table contains private fields (owner_email, residential address, billing details).
-- Raw table SELECT is strictly limited to verified owners.
-- Anonymous and general authenticated users CANNOT SELECT from raw businesses.
CREATE POLICY businesses_owner_select ON businesses
  FOR SELECT
  USING (
    owner_id = current_auth_uid()
  );

-- Direct client mutations on businesses are completely revoked from anon and authenticated.
-- All business creation, updates, billing adjustments, status changes, ratings, and archiving
-- must be performed via the verified server APIs (which enforce payment validation, state machines, audits, and address privacy).
REVOKE ALL ON TABLE businesses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE businesses FROM authenticated;
GRANT SELECT ON TABLE businesses TO authenticated;

-- Security projection view for public business discovery with explicitly selected safe public columns.
-- Excludes private owner_email, billing details, staff roster, engagement/ranking internals, and conceals residential addresses for home-based / mobile.
-- Standard view runs with view definer permissions, allowing public discovery without granting access to the raw table.
CREATE OR REPLACE VIEW public_businesses_directory AS
SELECT
  id,
  name,
  entity_type,
  short_description,
  category,
  custom_category,
  subcategory,
  custom_subcategory,
  keywords,
  business_location_type,
  location_type,
  is_service_area_only,
  publish_street_address,
  CASE
    WHEN is_service_area_only = TRUE
      OR location_type IN ('service_area', 'online_only')
      OR business_location_type = 'Mobile business'
      OR (business_location_type = 'Home-based' AND home_visit_allowed = FALSE)
    THEN ''
    ELSE address
  END AS address,
  city,
  state,
  zip_code,
  service_area,
  CASE
    WHEN is_service_area_only = TRUE
      OR location_type IN ('service_area', 'online_only')
      OR business_location_type = 'Mobile business'
      OR (business_location_type = 'Home-based' AND home_visit_allowed = FALSE)
    THEN ''
    ELSE directions_url
  END AS directions_url,
  phone,
  email,
  website,
  order_online_url,
  booking_url,
  logo_url,
  photos,
  menu_photos,
  menu_file_url,
  menu_items,
  services,
  hours,
  flyer,
  ranking_tier,
  average_rating,
  rating_count,
  created_at,
  status
FROM businesses
WHERE status = 'active';

GRANT SELECT ON public_businesses_directory TO anon, authenticated;

-- 4. CUSTOMER_REVIEWS:
-- Public can view published reviews (safe fields)
CREATE POLICY reviews_public_select ON customer_reviews
  FOR SELECT
  USING (status = 'published');

-- Anyone can submit reviews for active businesses (validated server-side)
CREATE POLICY reviews_insert ON customer_reviews
  FOR INSERT
  WITH CHECK (
    rating >= 1 AND rating <= 5
    AND EXISTS (SELECT 1 FROM businesses WHERE id = business_id AND status = 'active')
  );

-- Stored procedure for safe review flagging by verified owner or assigned staff.
-- Direct table UPDATE on customer_reviews is revoked to prevent tampering with rating, comment, or status.
CREATE OR REPLACE FUNCTION flag_review(p_review_id TEXT, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz_id TEXT;
BEGIN
  IF p_review_id IS NULL OR TRIM(p_review_id) = '' THEN
    RAISE EXCEPTION 'Review ID cannot be empty';
  END IF;

  SELECT business_id INTO v_biz_id FROM customer_reviews WHERE id = p_review_id;
  IF v_biz_id IS NULL THEN
    RAISE EXCEPTION 'Review not found';
  END IF;

  -- Ensure caller is owner or staff of the business
  IF NOT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = v_biz_id
    AND (
      owner_id = current_auth_uid()
      OR staff @> jsonb_build_array(jsonb_build_object('userId', current_auth_uid()))
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to flag reviews for this business';
  END IF;

  -- Strictly restrict updates to flag metadata fields only (cannot alter rating, comment, or status)
  UPDATE customer_reviews
  SET flagged_by_owner = TRUE,
      flag_reason = COALESCE(TRIM(p_reason), 'Flagged for moderation'),
      flagged_at = NOW()
  WHERE id = p_review_id;

  RETURN TRUE;
END;
$$;

-- Revoke function execution from PUBLIC and anon; grant strictly to authenticated callers
REVOKE EXECUTE ON FUNCTION flag_review(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION flag_review(TEXT, TEXT) TO authenticated;

-- Revoke direct table UPDATE and DELETE on customer_reviews from clients
REVOKE UPDATE, DELETE ON TABLE customer_reviews FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE customer_reviews TO anon, authenticated;

-- 5. MODERATION_ACTIONS:
-- Strictly server service-role only. No client policies.
REVOKE ALL ON TABLE moderation_actions FROM anon, authenticated;

-- 6. BUSINESS_REPORTS:
-- Public can submit reports on businesses; viewing and resolving is server admin only.
CREATE POLICY reports_insert ON business_reports
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM businesses WHERE id = business_id));

REVOKE SELECT, UPDATE, DELETE ON TABLE business_reports FROM anon, authenticated;
GRANT INSERT ON TABLE business_reports TO anon, authenticated;

-- 7. AUDIT_EVENTS & PAYMENT LEDGER:
-- Strictly server service-role only.
REVOKE ALL ON TABLE audit_events FROM anon, authenticated;
REVOKE ALL ON TABLE processed_payment_events FROM anon, authenticated;

-- 8. REMINDERS:
-- Business owner can view reminders for their business only.
CREATE POLICY reminders_owner_select ON reminder_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE id = business_id
      AND owner_id = current_auth_uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE reminder_logs FROM anon, authenticated;
GRANT SELECT ON TABLE reminder_logs TO authenticated;

-- 9. REFERRALS:
-- Referrer or referred business owner can view referral records for their business.
CREATE POLICY referrals_owner_select ON referrals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE (id = referrer_business_id OR id = referred_business_id)
      AND owner_id = current_auth_uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE referrals FROM anon, authenticated;
GRANT SELECT ON TABLE referrals TO authenticated;

-- 10. SESSIONS:
-- User can only inspect and terminate their own session. CSRF tokens remain private.
CREATE POLICY sessions_user_select ON app_sessions
  FOR SELECT
  USING (user_id = current_auth_uid());

CREATE POLICY sessions_user_delete ON app_sessions
  FOR DELETE
  USING (user_id = current_auth_uid());

REVOKE INSERT, UPDATE ON TABLE app_sessions FROM anon, authenticated;
GRANT SELECT, DELETE ON TABLE app_sessions TO authenticated;
