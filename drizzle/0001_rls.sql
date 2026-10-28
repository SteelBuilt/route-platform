-- Row-level security: the database backstop for tenant isolation and the
-- privacy release (docs/ARCHITECTURE.md §4). The app runs tenant work as
-- role app_user with app.user_id / app.org_id / app.platform_admin set per
-- transaction. Auth tables, jobs, billing events and the dev outbox get no
-- app_user grants at all; only trusted server code (table owner) uses them.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT app_user TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_user;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_org() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_uid() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.platform_admin', true), '') = 'on' $$;
--> statement-breakpoint

-- True when the caller's org holds an accepted (live or finished) assignment
-- covering the stop / route. This is the privacy release predicate.
CREATE OR REPLACE FUNCTION app_released_stop(p_stop uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (
     SELECT 1 FROM assignment_stops s JOIN assignments a ON a.id = s.assignment_id
     WHERE s.stop_id = p_stop AND a.provider_org_id = app_org()
       AND a.status IN ('scheduled','in_progress','pending_review','completed')) $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_released_route(p_route uuid) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (
     SELECT 1 FROM assignments a
     WHERE a.route_id = p_route AND a.provider_org_id = app_org()
       AND a.status IN ('scheduled','in_progress','pending_review','completed')) $$;
--> statement-breakpoint

-- ---------------------------------------------------------------- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON users TO app_user;
--> statement-breakpoint
GRANT UPDATE (name, phone) ON users TO app_user;
--> statement-breakpoint
CREATE POLICY users_select ON users FOR SELECT TO app_user USING (
  id = app_uid() OR app_is_admin()
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.org_id = app_org())
);
--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE TO app_user USING (id = app_uid());
--> statement-breakpoint

-- ---------------------------------------------------------------- organizations
-- Org rows are readable by any signed-in caller (names appear on listings and
-- profiles); API serializers expose only public columns to non-members.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, UPDATE ON organizations TO app_user;
--> statement-breakpoint
CREATE POLICY organizations_select ON organizations FOR SELECT TO app_user USING (
  status <> 'deleted' OR id = app_org() OR app_is_admin()
);
--> statement-breakpoint
CREATE POLICY organizations_update ON organizations FOR UPDATE TO app_user USING (
  id = app_org() OR app_is_admin()
);
--> statement-breakpoint

-- ---------------------------------------------------------------- memberships
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON memberships TO app_user;
--> statement-breakpoint
CREATE POLICY memberships_select ON memberships FOR SELECT TO app_user USING (
  org_id = app_org() OR user_id = app_uid() OR app_is_admin()
);
--> statement-breakpoint
CREATE POLICY memberships_write ON memberships FOR INSERT TO app_user WITH CHECK (
  org_id = app_org() OR app_is_admin()
);
--> statement-breakpoint
CREATE POLICY memberships_update ON memberships FOR UPDATE TO app_user USING (
  org_id = app_org() OR app_is_admin()
);
--> statement-breakpoint

-- ---------------------------------------------------------------- simple org-owned tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invitations','crews','vehicles','preferred_providers','route_templates',
                           'route_internal','route_versions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO app_user USING (org_id = app_org() OR app_is_admin()) WITH CHECK (org_id = app_org() OR app_is_admin())', t || '_tenant', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------- public profile tables
-- Readable by any signed-in caller (self-reported profile info); writable by owner org.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['provider_profiles','service_regions','provider_equipment']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_user USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO app_user WITH CHECK (org_id = app_org() OR app_is_admin())', t || '_ins', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO app_user USING (org_id = app_org() OR app_is_admin())', t || '_upd', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO app_user USING (org_id = app_org() OR app_is_admin())', t || '_del', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------- catalog + config
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['building_categories','equipment_types','qualification_types','plans','app_config','zip_centroids']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_user USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO app_user WITH CHECK (app_is_admin())', t || '_ins', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO app_user USING (app_is_admin())', t || '_upd', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- ---------------------------------------------------------------- subscriptions (read own; writes are system/admin)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, UPDATE ON subscriptions TO app_user;
--> statement-breakpoint
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO app_user USING (
  org_id = app_org() OR app_is_admin()
);
--> statement-breakpoint
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE TO app_user USING (app_is_admin());
--> statement-breakpoint

-- ---------------------------------------------------------------- audit log (append-only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO app_user;
--> statement-breakpoint
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO app_user USING (
  app_org() = ANY (org_ids) OR app_is_admin()
);
--> statement-breakpoint
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO app_user WITH CHECK (
  actor_user_id IS NOT DISTINCT FROM app_uid() OR app_is_admin()
);
--> statement-breakpoint

-- ---------------------------------------------------------------- routes
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON routes TO app_user;
--> statement-breakpoint
CREATE POLICY routes_select ON routes FOR SELECT TO app_user USING (
  org_id = app_org() OR app_is_admin()
  OR (deleted_at IS NULL AND status = 'published' AND visibility = 'marketplace')
  OR (deleted_at IS NULL AND status = 'published' AND EXISTS (
        SELECT 1 FROM route_invitations ri WHERE ri.route_id = routes.id AND ri.provider_org_id = app_org()))
  OR EXISTS (SELECT 1 FROM applications a WHERE a.route_id = routes.id AND a.provider_org_id = app_org())
);
--> statement-breakpoint
CREATE POLICY routes_insert ON routes FOR INSERT TO app_user WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY routes_update ON routes FOR UPDATE TO app_user USING (org_id = app_org() OR app_is_admin());
--> statement-breakpoint

ALTER TABLE route_invitations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON route_invitations TO app_user;
--> statement-breakpoint
CREATE POLICY route_invitations_select ON route_invitations FOR SELECT TO app_user USING (
  org_id = app_org() OR provider_org_id = app_org() OR app_is_admin()
);
--> statement-breakpoint
CREATE POLICY route_invitations_write ON route_invitations FOR INSERT TO app_user WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY route_invitations_update ON route_invitations FOR UPDATE TO app_user USING (
  org_id = app_org() OR provider_org_id = app_org()
);
--> statement-breakpoint
CREATE POLICY route_invitations_delete ON route_invitations FOR DELETE TO app_user USING (org_id = app_org());
--> statement-breakpoint

-- Tables whose public rows follow route visibility.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stops','route_requirements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_user USING (org_id = app_org() OR app_is_admin() OR EXISTS (SELECT 1 FROM routes r WHERE r.id = %I.route_id))', t || '_read', t, t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO app_user WITH CHECK (org_id = app_org())', t || '_ins', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO app_user USING (org_id = app_org() OR app_is_admin())', t || '_upd', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO app_user USING (org_id = app_org())', t || '_del', t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE stop_equipment ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON stop_equipment TO app_user;
--> statement-breakpoint
CREATE POLICY stop_equipment_read ON stop_equipment FOR SELECT TO app_user USING (
  org_id = app_org() OR app_is_admin() OR EXISTS (SELECT 1 FROM stops s WHERE s.id = stop_equipment.stop_id)
);
--> statement-breakpoint
CREATE POLICY stop_equipment_write ON stop_equipment FOR ALL TO app_user USING (org_id = app_org()) WITH CHECK (org_id = app_org());
--> statement-breakpoint

-- ---------------------------------------------------------------- private (privacy release)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO app_user;
--> statement-breakpoint
CREATE POLICY locations_read ON locations FOR SELECT TO app_user USING (
  org_id = app_org() OR app_is_admin()
  OR EXISTS (SELECT 1 FROM stops s WHERE s.location_id = locations.id AND app_released_stop(s.id))
  OR EXISTS (SELECT 1 FROM routes r WHERE r.pickup_location_id = locations.id AND app_released_route(r.id))
);
--> statement-breakpoint
CREATE POLICY locations_write ON locations FOR ALL TO app_user USING (org_id = app_org()) WITH CHECK (org_id = app_org());
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stop_contacts','stop_private']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_user USING (org_id = app_org() OR app_is_admin() OR app_released_stop(stop_id))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO app_user USING (org_id = app_org()) WITH CHECK (org_id = app_org())', t || '_write', t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE route_private ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON route_private TO app_user;
--> statement-breakpoint
CREATE POLICY route_private_read ON route_private FOR SELECT TO app_user USING (
  org_id = app_org() OR app_is_admin() OR app_released_route(route_id)
);
--> statement-breakpoint
CREATE POLICY route_private_write ON route_private FOR ALL TO app_user USING (org_id = app_org()) WITH CHECK (org_id = app_org());
--> statement-breakpoint

-- ---------------------------------------------------------------- two-party tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['applications','awards','assignments','assignment_stops']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO app_user', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_user USING (poster_org_id = app_org() OR provider_org_id = app_org() OR app_is_admin())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO app_user USING (poster_org_id = app_org() OR provider_org_id = app_org())', t || '_upd', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Who may create rows: applicants create applications; posters create awards.
-- Assignments are created by the accept transaction (trusted server path).
CREATE POLICY applications_ins ON applications FOR INSERT TO app_user WITH CHECK (provider_org_id = app_org());
--> statement-breakpoint
CREATE POLICY awards_ins ON awards FOR INSERT TO app_user WITH CHECK (poster_org_id = app_org());
--> statement-breakpoint

-- ---------------------------------------------------------------- files
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON files TO app_user;
--> statement-breakpoint
CREATE POLICY files_read ON files FOR SELECT TO app_user USING (
  org_id = app_org() OR app_is_admin()
  OR visibility_class = 'profile_public'
  OR (visibility_class = 'listing' AND route_id IS NOT NULL AND EXISTS (SELECT 1 FROM routes r WHERE r.id = files.route_id))
  OR (visibility_class = 'assignment' AND (
        (stop_id IS NOT NULL AND app_released_stop(stop_id))
        OR (stop_id IS NULL AND route_id IS NOT NULL AND app_released_route(route_id))))
);
--> statement-breakpoint
CREATE POLICY files_ins ON files FOR INSERT TO app_user WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY files_upd ON files FOR UPDATE TO app_user USING (org_id = app_org());
