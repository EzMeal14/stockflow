-- =====================================================
-- StockFlow: Triggers and Stored Procedures
-- File 2 of 2. Run after 01_schema.sql
--
-- HOW "WHO DID IT" WORKS
-- The app (or a procedure) sets two session values inside a transaction:
--   app.user_id        = the user making the change
--   app.movement_type  = why stock changed (restock, order_out, ...)
-- Triggers read these values to fill audit_logs and stock_movements.
-- Example from the app, inside one transaction:
--   SELECT set_config('app.user_id', '<user uuid>', true);
-- =====================================================


-- =====================================================
-- PART A: TRIGGERS
-- =====================================================

-- ---------- Trigger 1: Audit log (who, what, when) ----------
-- One reusable function. Pass the primary key column name as the argument.
-- SECURITY DEFINER = the app role does not need direct write access to audit_logs.
CREATE OR REPLACE FUNCTION fn_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pk   text  := TG_ARGV[0];
    v_user uuid  := NULLIF(current_setting('app.user_id', true), '')::uuid;
    v_old  jsonb;
    v_new  jsonb;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD) - 'password_hash';   -- never store password hashes in logs
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW) - 'password_hash';
    END IF;

    INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES (TG_TABLE_NAME,
            (COALESCE(v_new, v_old) ->> v_pk)::uuid,
            TG_OP::audit_action,
            v_old,
            v_new,
            v_user);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('user_id');

CREATE TRIGGER trg_audit_inventory
    AFTER INSERT OR UPDATE OR DELETE ON inventory
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('inventory_id');

CREATE TRIGGER trg_audit_orders
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('order_id');

CREATE TRIGGER trg_audit_shipments
    AFTER INSERT OR UPDATE OR DELETE ON shipments
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row('shipment_id');


-- ---------- Trigger 2: Log every stock change in stock_movements ----------
CREATE OR REPLACE FUNCTION fn_log_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
    v_type movement_type :=
        COALESCE(NULLIF(current_setting('app.movement_type', true), ''), 'adjustment')::movement_type;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'app.user_id must be set before changing stock';
    END IF;

    INSERT INTO stock_movements (inventory_id, movement_type, quantity_change, performed_by)
    VALUES (NEW.inventory_id, v_type, NEW.quantity - OLD.quantity, v_user);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_inventory_movement
    AFTER UPDATE OF quantity ON inventory
    FOR EACH ROW
    WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
    EXECUTE FUNCTION fn_log_stock_movement();


-- ---------- Trigger 3: Deduct stock when an order is confirmed ----------
-- The UPDATE locks each inventory row, so two orders cannot take the same stock
-- at the same time. If stock would go below 0, the CHECK constraint fails and
-- the whole confirmation is rolled back.
CREATE OR REPLACE FUNCTION fn_deduct_stock_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    r record;
BEGIN
    PERFORM set_config('app.movement_type', 'order_out', true);

    -- ORDER BY item_id: always lock rows in the same order (avoids deadlocks)
    FOR r IN
        SELECT item_id, quantity
        FROM order_items
        WHERE order_id = NEW.order_id
        ORDER BY item_id
    LOOP
        UPDATE inventory
        SET quantity = quantity - r.quantity
        WHERE warehouse_id = NEW.warehouse_id
          AND item_id = r.item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % is not stocked in this warehouse', r.item_id;
        END IF;
    END LOOP;

    PERFORM set_config('app.movement_type', '', true);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_order_confirm_deduct
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status = 'pending' AND NEW.status = 'confirmed')
    EXECUTE FUNCTION fn_deduct_stock_on_confirm();


-- ---------- Trigger 4 (small): keep inventory.updated_at fresh ----------
CREATE OR REPLACE FUNCTION fn_touch_inventory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inventory_touch
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION fn_touch_inventory();


-- =====================================================
-- PART B: STORED PROCEDURES / FUNCTIONS
-- =====================================================

-- ---------- place_order ----------
-- Creates a PENDING order after checking stock is available.
-- p_items example: '[{"item_id":"<uuid>","quantity":2},{"item_id":"<uuid>","quantity":1}]'
-- Returns the new order_id.
CREATE OR REPLACE FUNCTION place_order(
    p_client_id        uuid,
    p_warehouse_id     uuid,
    p_delivery_address text,
    p_items            jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id  uuid;
    v_item      record;
    v_available integer;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order must have at least one item';
    END IF;

    PERFORM 1 FROM users
    WHERE user_id = p_client_id AND role = 'client' AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Client not found or not active';
    END IF;

    PERFORM set_config('app.user_id', p_client_id::text, true);

    INSERT INTO orders (client_id, warehouse_id, status, delivery_address)
    VALUES (p_client_id, p_warehouse_id, 'pending', p_delivery_address)
    RETURNING order_id INTO v_order_id;

    -- Combine duplicate items, then check stock for each one
    FOR v_item IN
        SELECT item_id, SUM(quantity)::integer AS quantity
        FROM (
            SELECT (e ->> 'item_id')::uuid AS item_id,
                   (e ->> 'quantity')::integer AS quantity
            FROM jsonb_array_elements(p_items) AS e
        ) AS t
        GROUP BY item_id
        ORDER BY item_id
    LOOP
        SELECT quantity INTO v_available
        FROM inventory
        WHERE warehouse_id = p_warehouse_id AND item_id = v_item.item_id;

        IF NOT FOUND OR v_available < v_item.quantity THEN
            RAISE EXCEPTION 'Not enough stock for item %', v_item.item_id;
        END IF;

        INSERT INTO order_items (order_id, item_id, quantity, unit_price)
        SELECT v_order_id, v_item.item_id, v_item.quantity, unit_price
        FROM items
        WHERE item_id = v_item.item_id AND is_active;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % does not exist or is inactive', v_item.item_id;
        END IF;
    END LOOP;

    RETURN v_order_id;
END;
$$;


-- ---------- confirm_order ----------
-- Changes status pending -> confirmed. Trigger 3 then deducts stock safely.
CREATE OR REPLACE PROCEDURE confirm_order(p_order_id uuid, p_user_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('app.user_id', p_user_id::text, true);

    UPDATE orders
    SET status = 'confirmed'
    WHERE order_id = p_order_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found or is not pending', p_order_id;
    END IF;
END;
$$;


-- ---------- transfer_stock ----------
-- Moves stock from one warehouse to another in ONE transaction.
CREATE OR REPLACE PROCEDURE transfer_stock(
    p_from_warehouse uuid,
    p_to_warehouse   uuid,
    p_item_id        uuid,
    p_quantity       integer,
    p_user_id        uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_available integer;
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;
    IF p_from_warehouse = p_to_warehouse THEN
        RAISE EXCEPTION 'Source and destination warehouse must be different';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::text, true);

    -- Make sure the destination row exists
    INSERT INTO inventory (warehouse_id, item_id, quantity)
    VALUES (p_to_warehouse, p_item_id, 0)
    ON CONFLICT (warehouse_id, item_id) DO NOTHING;

    -- Lock both rows (same order every time to avoid deadlocks)
    PERFORM 1 FROM inventory
    WHERE item_id = p_item_id
      AND warehouse_id IN (p_from_warehouse, p_to_warehouse)
    ORDER BY warehouse_id
    FOR UPDATE;

    SELECT quantity INTO v_available
    FROM inventory
    WHERE warehouse_id = p_from_warehouse AND item_id = p_item_id;

    IF NOT FOUND OR v_available < p_quantity THEN
        RAISE EXCEPTION 'Not enough stock in source warehouse';
    END IF;

    PERFORM set_config('app.movement_type', 'transfer_out', true);
    UPDATE inventory SET quantity = quantity - p_quantity
    WHERE warehouse_id = p_from_warehouse AND item_id = p_item_id;

    PERFORM set_config('app.movement_type', 'transfer_in', true);
    UPDATE inventory SET quantity = quantity + p_quantity
    WHERE warehouse_id = p_to_warehouse AND item_id = p_item_id;

    PERFORM set_config('app.movement_type', '', true);
END;
$$;


-- ---------- restock_stock ----------
-- Adds stock to a warehouse (for example, a supplier delivery).
CREATE OR REPLACE PROCEDURE restock_stock(
    p_warehouse_id uuid,
    p_item_id      uuid,
    p_quantity     integer,
    p_user_id      uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;

    PERFORM set_config('app.user_id', p_user_id::text, true);
    PERFORM set_config('app.movement_type', 'restock', true);

    INSERT INTO inventory (warehouse_id, item_id, quantity)
    VALUES (p_warehouse_id, p_item_id, 0)
    ON CONFLICT (warehouse_id, item_id) DO NOTHING;

    UPDATE inventory
    SET quantity = quantity + p_quantity
    WHERE warehouse_id = p_warehouse_id AND item_id = p_item_id;

    PERFORM set_config('app.movement_type', '', true);
END;
$$;


-- =====================================================
-- QUICK TEST (remove the -- to try; replace the uuids)
-- =====================================================
-- CALL restock_stock('<warehouse uuid>', '<item uuid>', 50, '<admin uuid>');
-- SELECT place_order('<client uuid>', '<warehouse uuid>', 'Cebu City',
--        '[{"item_id":"<item uuid>","quantity":5}]');
-- CALL confirm_order('<order uuid>', '<admin uuid>');
-- CALL transfer_stock('<from wh>', '<to wh>', '<item uuid>', 10, '<admin uuid>');
-- SELECT * FROM stock_movements ORDER BY created_at DESC;
-- SELECT * FROM audit_logs ORDER BY changed_at DESC;
-- SELECT * FROM v_low_stock;
