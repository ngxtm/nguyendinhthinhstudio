\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RBAC contract failed: %', message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  (SELECT enum_range(NULL::public.app_role)::text[] = ARRAY['admin']::text[]),
  'public.app_role must contain only admin'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_roles'
      AND c.contype = 'p'
      AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (user_id)'
  ),
  'user_roles must be keyed by user_id'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'user_roles'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE%'
  ),
  'user_roles must reference auth.users(id) ON DELETE CASCADE'
);

SELECT pg_temp.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'user_roles'),
  'user_roles must enable and force RLS'
);

SELECT pg_temp.assert_true(
  NOT has_table_privilege('anon', 'public.user_roles', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.user_roles', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('supabase_auth_admin', 'public.user_roles', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser roles and supabase_auth_admin must have no direct user_roles privileges'
);

SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auth_hook_user_role_reader' AND NOT rolcanlogin),
  'dedicated auth-hook owner must be NOLOGIN'
);

SELECT pg_temp.assert_true(
  has_schema_privilege('auth_hook_user_role_reader', 'auth_hooks', 'USAGE,CREATE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace
    WHERE nspname <> 'auth_hooks'
      AND nspname NOT LIKE 'pg_temp_%'
      AND nspname NOT LIKE 'pg_toast_temp_%'
      AND has_schema_privilege('auth_hook_user_role_reader', oid, 'CREATE')
  ),
  'hook owner may create objects only in auth_hooks'
);

SELECT pg_temp.assert_true(
  has_column_privilege('auth_hook_user_role_reader', 'public.user_roles', 'user_id', 'SELECT')
  AND has_column_privilege('auth_hook_user_role_reader', 'public.user_roles', 'role', 'SELECT')
  AND NOT has_table_privilege('auth_hook_user_role_reader', 'public.user_roles', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'auth-hook owner must have narrow lookup access and no mutation privileges'
);

SELECT pg_temp.assert_true(
  has_schema_privilege('supabase_auth_admin', 'auth_hooks', 'USAGE')
  AND NOT has_schema_privilege('supabase_auth_admin', 'auth_hooks', 'CREATE'),
  'supabase_auth_admin must have USAGE but not CREATE on auth_hooks'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'supabase_auth_admin',
    'auth_hooks.custom_access_token_hook(jsonb)',
    'EXECUTE'
  ),
  'supabase_auth_admin must execute the exact hook signature'
);

SELECT pg_temp.assert_true(
  (SELECT p.prosecdef
          AND pg_catalog.array_to_string(p.proconfig, ',') IN ('search_path=', 'search_path=""')
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'auth_hooks'
     AND p.proname = 'custom_access_token_hook'
     AND pg_get_function_identity_arguments(p.oid) = 'event jsonb'),
  'hook must be SECURITY DEFINER with empty search_path'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = function.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        function.proacl,
        pg_catalog.acldefault('f', function.proowner)
      )
    ) AS privilege
    WHERE namespace.nspname = 'auth_hooks'
      AND function.proname = 'custom_access_token_hook'
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  )
  AND NOT has_function_privilege('anon', 'auth_hooks.custom_access_token_hook(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'auth_hooks.custom_access_token_hook(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('auth_hook_user_role_reader', 'auth_hooks.custom_access_token_hook(jsonb)', 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth_hooks'
      AND p.proname <> 'custom_access_token_hook'
      AND has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
  ),
  'hook execute must be revoked from PUBLIC/browser roles'
);

SELECT pg_temp.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'admin_audit_events'),
  'admin_audit_events must enable and force RLS'
);

SELECT pg_temp.assert_true(
  NOT has_table_privilege('anon', 'public.admin_audit_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('supabase_auth_admin', 'public.admin_audit_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND has_column_privilege('service_role', 'public.admin_audit_events', 'operator_user_id', 'INSERT')
  AND has_column_privilege('service_role', 'public.admin_audit_events', 'target_user_id', 'INSERT')
  AND has_column_privilege('service_role', 'public.admin_audit_events', 'action', 'INSERT')
  AND has_column_privilege('service_role', 'public.admin_audit_events', 'outcome', 'INSERT')
  AND has_column_privilege('service_role', 'public.admin_audit_events', 'correlation_id', 'INSERT')
  AND has_column_privilege('service_role', 'public.admin_audit_events', 'metadata', 'INSERT')
  AND NOT has_column_privilege('service_role', 'public.admin_audit_events', 'id', 'INSERT')
  AND NOT has_column_privilege('service_role', 'public.admin_audit_events', 'created_at', 'INSERT')
  AND NOT has_table_privilege('service_role', 'public.admin_audit_events', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'audit events must be append-only and inaccessible to browser/auth-admin roles'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_audit_events'
    GROUP BY table_schema, table_name
    HAVING array_agg(column_name::text ORDER BY column_name) @>
      ARRAY['action','correlation_id','created_at','metadata','operator_user_id','outcome','target_user_id']::text[]
  ),
  'audit table must expose required operator/target/action/outcome/correlation/timestamp/metadata columns'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_audit_events'
      AND column_name IN ('operator_user_id','action','outcome','correlation_id','created_at','metadata')
      AND is_nullable <> 'NO'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_audit_events'
      AND column_name = 'created_at' AND column_default = 'now()'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_audit_events'
      AND column_name = 'metadata' AND column_default LIKE '%{}%jsonb%'
  )
  AND (
    SELECT count(*) >= 4
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'admin_audit_events'
      AND c.contype IN ('f','c')
  ),
  'audit fields must enforce nullability, defaults, foreign keys and checks'
);

CREATE TEMP TABLE rbac_subjects (id uuid PRIMARY KEY, email text NOT NULL);
INSERT INTO rbac_subjects VALUES
  (gen_random_uuid(), 'rbac-subject-a@example.invalid'),
  (gen_random_uuid(), 'rbac-subject-b@example.invalid');

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, '', now(), now()
FROM rbac_subjects;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM rbac_subjects;

SELECT pg_catalog.set_config(
  'auth_hooks.subject_id',
  (SELECT id::text FROM rbac_subjects ORDER BY email LIMIT 1),
  true
);
SET LOCAL ROLE auth_hook_user_role_reader;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.user_roles)
  AND (
    SELECT user_id = current_setting('auth_hooks.subject_id')::uuid
    FROM public.user_roles
  ),
  'hook-owner RLS must expose only the configured subject'
);
RESET ROLE;

DELETE FROM auth.users WHERE id IN (SELECT id FROM rbac_subjects);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id IN (SELECT id FROM rbac_subjects)),
  'subject fixtures must cascade out of user_roles'
);

CREATE OR REPLACE FUNCTION pg_temp.assert_service_role_immutable(
  operator_id uuid,
  correlation uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.admin_audit_events
    (operator_user_id, action, outcome, correlation_id, metadata)
  VALUES (operator_id, 'rbac.service-role-contract', 'success', correlation, '{}'::jsonb);

  BEGIN
    UPDATE public.admin_audit_events SET outcome = 'failure'
    WHERE correlation_id = correlation;
    RAISE EXCEPTION 'RBAC contract failed: service_role UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'RBAC contract failed:%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.admin_audit_events WHERE correlation_id = correlation;
    RAISE EXCEPTION 'RBAC contract failed: service_role DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'RBAC contract failed:%' THEN RAISE; END IF;
  END;

  BEGIN
    TRUNCATE public.admin_audit_events;
    RAISE EXCEPTION 'RBAC contract failed: service_role TRUNCATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

SELECT gen_random_uuid() AS audit_operator_id, gen_random_uuid() AS audit_correlation_id \gset
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES (
  :'audit_operator_id',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'rbac-audit-operator@example.invalid',
  '',
  now(),
  now()
);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_service_role_immutable(
  :'audit_operator_id'::uuid,
  :'audit_correlation_id'::uuid
);
RESET ROLE;

DO $$
DECLARE
  probe_user uuid := gen_random_uuid();
  result jsonb;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (
    probe_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rbac-contract@example.invalid',
    '',
    now(),
    now()
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (probe_user, 'admin');

  BEGIN
    INSERT INTO public.user_roles (user_id, role) VALUES (probe_user, 'admin');
    RAISE EXCEPTION 'RBAC contract failed: duplicate role row unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  CREATE TEMP TABLE user_roles (user_id uuid, role text);
  INSERT INTO user_roles VALUES (probe_user, 'not-admin');

  result := auth_hooks.custom_access_token_hook(
    jsonb_build_object(
      'user_id', probe_user,
      'claims', jsonb_build_object('sub', probe_user, 'user_role', 'forged')
    )
  );
  PERFORM pg_temp.assert_true(
    result #>> '{claims,user_role}' = 'admin',
    'hook must merge user_role=admin for an admin member'
  );

  DELETE FROM auth.users WHERE id = probe_user;
  PERFORM pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = probe_user),
    'deleting auth.users row must cascade to user_roles'
  );

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (
    probe_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rbac-contract-recreated@example.invalid',
    '',
    now(),
    now()
  );

  result := auth_hooks.custom_access_token_hook(
    jsonb_build_object(
      'user_id', probe_user,
      'claims', jsonb_build_object('sub', probe_user, 'user_role', 'admin')
    )
  );
  PERFORM pg_temp.assert_true(
    NOT (result #> '{claims}') ? 'user_role',
    'hook must not add user_role for a non-member'
  );

  INSERT INTO public.admin_audit_events
    (operator_user_id, target_user_id, action, outcome, correlation_id, metadata)
  VALUES
    (probe_user, probe_user, 'rbac.contract', 'success', gen_random_uuid(), '{}'::jsonb);

  BEGIN
    UPDATE public.admin_audit_events
    SET outcome = 'failure'
    WHERE operator_user_id = probe_user AND action = 'rbac.contract';
    RAISE EXCEPTION 'RBAC contract failed: audit UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'RBAC contract failed:%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.admin_audit_events
    WHERE operator_user_id = probe_user AND action = 'rbac.contract';
    RAISE EXCEPTION 'RBAC contract failed: audit DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'RBAC contract failed:%' THEN RAISE; END IF;
  END;
END;
$$;

ROLLBACK;
