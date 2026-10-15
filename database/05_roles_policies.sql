-- =====================================================
-- StockFlow: Limited app role (no admin / root for the app)
-- Run AFTER 01 to 04. Run only ONCE.
-- Owner: Yandee (Cloud & Security Engineer)
--
-- BEFORE YOU RUN: change CHANGE_ME below to a long password
-- (letters and numbers only, so it works inside a connection string).
-- Do NOT commit the real password to GitHub. Keep CHANGE_ME in the repo file.
-- =====================================================

-- ---------- 1. The login role the app will use ----------
CREATE ROLE stockflow_app LOGIN PASSWORD 'CHANGE_ME';

-- ---------- 2. Allow it to see the public schema only ----------
GRANT USAGE ON SCHEMA public TO stockflow_app;

-- ---------- 3. Table permissions (only what the app needs) ----------
-- No DELETE anywhere: we use is_active = false (soft delete) instead.
-- No CREATE / DROP / ALTER: the app cannot change the structure.
GRANT SELECT, INSERT, UPDATE ON
    warehouses, users, items, inventory,
    orders, order_items, vehicles, shipments
TO stockflow_app;

-- Logs are read-only for the app. Triggers write to them.
GRANT SELECT ON stock_movements, audit_logs TO stockflow_app;

GRANT SELECT ON v_low_stock TO stockflow_app;

-- ---------- 4. Allow the stored procedures and functions ----------
GRANT EXECUTE ON FUNCTION  place_order(uuid, uuid, text, jsonb)          TO stockflow_app;
GRANT EXECUTE ON PROCEDURE confirm_order(uuid, uuid)                     TO stockflow_app;
GRANT EXECUTE ON PROCEDURE transfer_stock(uuid, uuid, uuid, integer, uuid) TO stockflow_app;
GRANT EXECUTE ON PROCEDURE restock_stock(uuid, uuid, integer, uuid)      TO stockflow_app;

-- ---------- 5. Row Level Security policies ----------
-- RLS is ON for every table (Supabase turned it on earlier).
-- Without a policy, this role would see nothing, so add one per table.
-- The GRANTs above still limit WHICH actions are allowed.
CREATE POLICY app_access ON warehouses   FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON users        FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON items        FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON inventory    FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON orders       FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON order_items  FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON vehicles     FOR ALL TO stockflow_app USING (true) WITH CHECK (true);
CREATE POLICY app_access ON shipments    FOR ALL TO stockflow_app USING (true) WITH CHECK (true);

-- Logs: read only
CREATE POLICY app_read ON stock_movements FOR SELECT TO stockflow_app USING (true);
CREATE POLICY app_read ON audit_logs      FOR SELECT TO stockflow_app USING (true);

-- =====================================================
-- CHECK IT WORKED (run these separately)
-- =====================================================
-- Should be true:
--   SELECT has_table_privilege('stockflow_app', 'orders', 'SELECT');
--   SELECT has_table_privilege('stockflow_app', 'orders', 'INSERT');
-- Should be false:
--   SELECT has_table_privilege('stockflow_app', 'orders', 'DELETE');
--   SELECT has_table_privilege('stockflow_app', 'audit_logs', 'INSERT');
--   SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'stockflow_app';
