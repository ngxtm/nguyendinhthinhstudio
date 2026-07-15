BEGIN;

-- Supabase admin RBAC.
-- Verification: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/backend/test/supabase-rbac.sql
-- The contract test requires a disposable Supabase-compatible database because it
-- inserts a rolled-back auth.users probe. Static/catalog assertions still document
-- the intended privileges when DIRECT_URL or the standard Supabase roles are absent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_hook_user_role_reader') THEN
    CREATE ROLE auth_hook_user_role_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

-- Do not modify role attributes here. Managed Supabase exposes a constrained
-- postgres role, and supautils rejects clauses that mention reserved
-- SUPERUSER/BYPASSRLS attributes. CREATE ROLE above already establishes them.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type AS type
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public'
      AND type.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated, supabase_auth_admin, auth_hook_user_role_reader;
GRANT USAGE ON SCHEMA public TO auth_hook_user_role_reader;
GRANT USAGE ON TYPE public.app_role TO auth_hook_user_role_reader;
GRANT SELECT (user_id, role) ON TABLE public.user_roles TO auth_hook_user_role_reader;

DROP POLICY IF EXISTS auth_hook_subject_role_lookup ON public.user_roles;
CREATE POLICY auth_hook_subject_role_lookup
  ON public.user_roles
  FOR SELECT
  TO auth_hook_user_role_reader
  USING (
    user_id = NULLIF(current_setting('auth_hooks.subject_id', true), '')::uuid
  );

-- PostgreSQL requires the migration role to be able to SET ROLE to a new
-- object owner. Keep that SET ROLE capability temporary and transactional.
DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT auth_hook_user_role_reader TO %I',
    session_user
  );
END
$$;

CREATE SCHEMA auth_hooks AUTHORIZATION auth_hook_user_role_reader;
REVOKE ALL ON SCHEMA auth_hooks FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  unexpected_schema text;
BEGIN
  SELECT namespace.nspname
  INTO unexpected_schema
  FROM pg_catalog.pg_namespace AS namespace
  WHERE namespace.nspname <> 'auth_hooks'
    AND pg_catalog.has_schema_privilege(
      'auth_hook_user_role_reader',
      namespace.oid,
      'CREATE'
    )
  ORDER BY namespace.nspname
  LIMIT 1;

  IF unexpected_schema IS NOT NULL THEN
    RAISE EXCEPTION
      'auth_hook_user_role_reader unexpectedly has CREATE on schema %',
      unexpected_schema
      USING ERRCODE = '42501';
  END IF;
END
$$;
REVOKE CREATE ON SCHEMA auth_hooks FROM supabase_auth_admin;
GRANT USAGE ON SCHEMA auth_hooks TO supabase_auth_admin;
GRANT USAGE, CREATE ON SCHEMA auth_hooks TO auth_hook_user_role_reader;

CREATE FUNCTION auth_hooks.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  subject_id uuid;
  claims jsonb;
  is_admin boolean;
BEGIN
  subject_id := NULLIF(event ->> 'user_id', '')::uuid;
  claims := COALESCE(event -> 'claims', '{}'::jsonb) - 'user_role';

  IF subject_id IS NOT NULL THEN
    PERFORM pg_catalog.set_config('auth_hooks.subject_id', subject_id::text, true);

    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles AS membership
      WHERE membership.user_id = subject_id
        AND membership.role = 'admin'::public.app_role
    )
    INTO is_admin;
  ELSE
    is_admin := false;
  END IF;

  IF is_admin THEN
    claims := claims || pg_catalog.jsonb_build_object('user_role', 'admin');
  END IF;

  RETURN pg_catalog.jsonb_set(event, '{claims}', claims, true);
END;
$$;

ALTER FUNCTION auth_hooks.custom_access_token_hook(jsonb) OWNER TO auth_hook_user_role_reader;
REVOKE ALL ON FUNCTION auth_hooks.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated, auth_hook_user_role_reader;
GRANT EXECUTE ON FUNCTION auth_hooks.custom_access_token_hook(jsonb) TO supabase_auth_admin;

CREATE TABLE public.admin_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (btrim(action) <> ''),
  outcome text NOT NULL CHECK (btrim(outcome) <> ''),
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX admin_audit_events_operator_created_at_idx
  ON public.admin_audit_events (operator_user_id, created_at DESC);
CREATE INDEX admin_audit_events_target_created_at_idx
  ON public.admin_audit_events (target_user_id, created_at DESC);
CREATE INDEX admin_audit_events_correlation_id_idx
  ON public.admin_audit_events (correlation_id);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_audit_events FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
REVOKE ALL ON SEQUENCE public.admin_audit_events_id_seq FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;

GRANT INSERT (
  operator_user_id,
  target_user_id,
  action,
  outcome,
  correlation_id,
  metadata
) ON public.admin_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_events_id_seq TO service_role;

CREATE POLICY admin_app_append_audit_events
  ON public.admin_audit_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE FUNCTION public.reject_admin_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_events is append-only'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_admin_audit_event_mutation() FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;

CREATE TRIGGER admin_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.admin_audit_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_admin_audit_event_mutation();

ALTER DEFAULT PRIVILEGES FOR ROLE auth_hook_user_role_reader IN SCHEMA auth_hooks
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE auth_hook_user_role_reader FROM %I',
    session_user
  );
END
$$;

COMMIT;
