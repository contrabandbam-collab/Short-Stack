# Supabase Authentication & Database Integration Guide

This guide describes how to configure Supabase Auth and PostgreSQL for the Short Stack application.

## 1. Required Environment Secret Names

Do not commit real secret values to source control. Set these environment variables in your server hosting secrets and client environment.

### Client-Side (Vite)
- `VITE_SUPABASE_URL`: The public HTTPS URL of your Supabase project (e.g. `https://<project-ref>.supabase.co`).
- `VITE_SUPABASE_PUBLISHABLE_KEY`: The public/publishable client API key (strictly replaces legacy anon key; never use legacy anon variable).

### Server-Side (Express Backend)
- `SUPABASE_URL`: The project URL matching your Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY`: The private server-side service role key (strictly server-only; never exposed to browser or client code).
- `SUPABASE_JWT_SECRET`: (Optional) The secret used to verify Supabase JWT signatures.
- `ADMIN_EMAILS`: Comma-separated list of trusted administrator email addresses (e.g. `admin@shortstack.local,admin@yourdomain.com`).
- `DATABASE_URL`: (Optional) Direct PostgreSQL connection URI for migrations and durable queries.

## 2. Supabase Project Setup Steps

1. **Create Project**:
   Create a project in the Supabase Dashboard. Note your project URL, publishable key, and service role key.

2. **Run Migrations**:
   Execute the migration SQL file located at:
   ```
   src/server/migrations/001_initial_schema_and_rls.sql
   ```
   (and mirrored at `migrations/001_initial_schema_and_rls.sql`).
   This provisions relational tables (`businesses`, `user_accounts`, `categories`, `customer_reviews`, `moderation_actions`, `audit_events`, etc.) with strict Row Level Security (RLS) policies.
   - **Password Security**: Supabase Auth owns user credentials. The `user_accounts` table stores no `password_hash` or `password_salt` columns.
   - **Least-Privilege Roles**: New user accounts strictly default to the `visitor` role with no self-signup path to `owner`, `staff`, or `admin`.
   - **Role Elevation**: Privileged roles are assigned exclusively through trusted server configuration (`ADMIN_EMAILS`), authorized business staff rosters, or server admin role elevation endpoints. Arbitrary session settings like `current_setting('app.current_user_role')` are NOT used as proof of admin.
   - **Non-Destructive**: The migration contains no `DROP`, `TRUNCATE`, or `DELETE` statements, preserving all schema structures and existing string IDs.

3. **Raw Table Protection & Public Projections**:
   - The raw `businesses` table contains private attributes including owner emails, home-based residential addresses, billing info, and staff rosters.
   - Direct anonymous and unauthenticated `SELECT` from the raw `businesses` table is REVOKED.
   - Direct client `INSERT`, `UPDATE`, and `DELETE` mutations on `businesses` are REVOKED from all client roles (`anon` and `authenticated`). All business listings, status transitions, billing adjustments, and ratings are managed exclusively through the verified server APIs (which enforce payment validation, state machines, audits, and address privacy).
   - Public consumers access directory listings through the server API safe projection (`getPublicBusinessProjection`, `enforceBusinessAddressPrivacy`) or the `public_businesses_directory` safe projection view, which strictly omits private fields and conceals residential addresses for home-based and mobile businesses without requiring raw table access.
   - Raw table SELECT on `businesses` is restricted to verified owners (`owner_id = current_auth_uid()`).
   - On `user_accounts`, client roles cannot elevate their `role` or modify their `email`. Direct INSERT and DELETE are revoked, and UPDATE is column-restricted to `(name)`.

4. **Review Immutability & Safe Flagging**:
   - Customer reviews are immutable: direct `UPDATE` and `DELETE` on `customer_reviews` is revoked from client roles.
   - Business owners and staff can only flag reviews for administrator investigation via the hardened `flag_review` stored procedure (restricted `search_path = public`, execution revoked from `anon`/`PUBLIC`, granted only to `authenticated`) or the authenticated `/api/reviews/:id/flag` server endpoint.
   - Review ratings, comments, and publication statuses cannot be modified by owners or staff; moderation is strictly restricted to administrators via the server service role.

5. **Configure Authentication**:
   - In Supabase Dashboard -> Authentication -> Providers:
     - Enable Email/Password provider.
     - Configure email confirmations according to your organization's security policy.
   - In Authentication -> Security / Multi-Factor Authentication:
     - Enable App Authenticator (TOTP) for Multi-Factor Authentication (MFA / AAL2).
     - Required for privileged business owner and administrator consoles.

6. **Inactivity Timeout**:
   A 10-minute (600,000 ms) inactivity logout is enforced both client-side and server-side across all authenticated sessions.

7. **Production Verification Status**:
   RLS and production durable storage are not considered launch-ready until verified against a live provisioned database instance. Without configured secrets, the application fails closed with HTTP 503 on all protected and privileged routes.
