-- Request-scoped queries run as `kroner_app`, a role with no BYPASSRLS and no
-- DDL rights. Superusers and table owners ignore row-level security, so
-- without this the policies in 0002 would be decorative on any deployment
-- where the app connects as the database owner.
--
-- Migrations and trusted internal work keep running as the connecting role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kroner_app') THEN
    CREATE ROLE kroner_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO kroner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kroner_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kroner_app;

-- Tables added by later migrations inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kroner_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO kroner_app;

-- The migrating role must be able to assume it via SET LOCAL ROLE.
DO $$
BEGIN
  EXECUTE format('GRANT kroner_app TO %I', current_user);
EXCEPTION WHEN OTHERS THEN
  -- Already a member, or the grant is managed externally.
  NULL;
END $$;

-- kroner_app must never be handed the schema_migrations table.
REVOKE ALL ON schema_migrations FROM kroner_app;
