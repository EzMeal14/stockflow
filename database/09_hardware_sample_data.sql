-- =====================================================
-- StockFlow: Sample data for a hardware and construction supplies distributor
-- Run AFTER 01 to 08. Run it in the Supabase SQL Editor as ONE query.
-- Safe to run more than once: it skips anything that already exists.
--
-- What it adds
--   4 warehouses (the MAIN one is in Tagbilaran, Bohol; 3 branches in Cebu),
--   27 items, 6 vehicles and the opening stock.
--   The opening stock is added with restock_stock(), the system's own procedure,
--   so Stock history and the audit log show real entries.
-- What it hides
--   The old test data (Cebu Main, Davao Branch, Test Item). It is switched off
--   with is_active = false. Nothing is deleted.
-- Ran an earlier version of this file? Run this one too. It renames the old
--   "CebuBuild ..." warehouses and keeps their stock. Nothing is made twice.
--
-- Needs at least one admin user (run backend/scripts/seed-users.js first).
-- Staff, drivers and clients are made by backend/scripts/seed-hardware-users.js,
-- so no password is stored in this file.
-- All names, addresses, plates and prices are made-up sample data.
-- =====================================================

DO $$
DECLARE
    admin_id  uuid;
    r         record;
    wh_names  text[] := ARRAY[
        'VisayasBuild Main Warehouse',
        'VisayasBuild Bogo Warehouse',
        'VisayasBuild Toledo Warehouse',
        'VisayasBuild Carcar Warehouse'];
    qtys      integer[];
    v_item_id uuid;
    v_wh_id   uuid;
    next_no   integer;
    cand      text;
    i         integer;
BEGIN
    -- The admin who "does" the work. This ID goes into the audit log and Stock history.
    SELECT user_id INTO admin_id
    FROM users WHERE role = 'admin' AND is_active
    ORDER BY created_at LIMIT 1;
    IF admin_id IS NULL THEN
        RAISE EXCEPTION 'No admin user found. Run backend/scripts/seed-users.js first.';
    END IF;
    PERFORM set_config('app.user_id', admin_id::text, true);

    -- ---------- 1. Warehouses ----------
    -- 1a. An earlier version of this file used the names "CebuBuild ..." and a main
    --     warehouse in Cebu City. Rename those (same rows, same stock, same staff).
    UPDATE warehouses SET name = 'VisayasBuild Main Warehouse',
           address = 'CPG Avenue', city = 'Tagbilaran City, Bohol'
    WHERE name = 'CebuBuild Main Warehouse'
      AND NOT EXISTS (SELECT 1 FROM warehouses x WHERE x.name = 'VisayasBuild Main Warehouse');
    UPDATE warehouses SET name = 'VisayasBuild Bogo Warehouse', city = 'Bogo City, Cebu'
    WHERE name = 'CebuBuild Bogo Warehouse'
      AND NOT EXISTS (SELECT 1 FROM warehouses x WHERE x.name = 'VisayasBuild Bogo Warehouse');
    UPDATE warehouses SET name = 'VisayasBuild Toledo Warehouse', city = 'Toledo City, Cebu'
    WHERE name = 'CebuBuild Toledo Warehouse'
      AND NOT EXISTS (SELECT 1 FROM warehouses x WHERE x.name = 'VisayasBuild Toledo Warehouse');
    UPDATE warehouses SET name = 'VisayasBuild Carcar Warehouse', city = 'Carcar City, Cebu'
    WHERE name = 'CebuBuild Carcar Warehouse'
      AND NOT EXISTS (SELECT 1 FROM warehouses x WHERE x.name = 'VisayasBuild Carcar Warehouse');

    -- 1b. Make any warehouse that is still missing
    INSERT INTO warehouses (name, address, city)
    SELECT v.name, v.address, v.city
    FROM (VALUES
        ('VisayasBuild Main Warehouse',   'CPG Avenue',            'Tagbilaran City, Bohol'),
        ('VisayasBuild Bogo Warehouse',   'Bogo National Highway', 'Bogo City, Cebu'),
        ('VisayasBuild Toledo Warehouse', 'Toledo National Road',  'Toledo City, Cebu'),
        ('VisayasBuild Carcar Warehouse', 'Carcar National Road',  'Carcar City, Cebu')
    ) AS v(name, address, city)
    WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.name = v.name);

    -- ---------- 2. Vehicles (trucks and vans for the shipments) ----------
    INSERT INTO vehicles (plate, type) VALUES
        ('GAA 1101', 'Cargo truck (10-wheeler)'),
        ('GAB 2202', 'Cargo truck (10-wheeler)'),
        ('GCC 3303', 'Delivery van'),
        ('GDD 4404', 'Delivery van'),
        ('GEE 5505', 'Pickup'),
        ('GFF 6606', 'Pickup')
    ON CONFLICT (plate) DO NOTHING;

    -- ---------- 3. Items and opening stock ----------
    -- One row per item: the SKU is the first free number (SKU-001, SKU-002, ...).
    -- Then the four quantities: Main, Bogo, Toledo, Carcar.
    -- Low stock is below 100. On purpose: Bogo is low on cement, hollow blocks and
    -- LED bulbs, and Toledo is OUT of 10 mm rebar (0), so the demo has something to show.
    FOR r IN
        SELECT * FROM (VALUES
            ( 1, 'Portland Cement 40 kg',     'Cement and masonry. Per 40 kg bag',    255.00, 3000,  60, 420, 380),
            ( 2, 'Hollow Blocks 4 inch',      'Cement and masonry. Per piece',         14.00, 2500,  90, 600, 550),
            ( 3, 'Tile Adhesive 20 kg',       'Cement and masonry. Per 20 kg bag',    285.00,  900, 150, 180, 160),
            ( 4, 'Common Nails 2 inch',       'Fasteners. Per 1 kg pack',              68.00, 1200, 260, 240, 210),
            ( 5, 'Common Nails 4 inch',       'Fasteners. Per 1 kg pack',              64.00, 1100, 230, 220, 200),
            ( 6, 'Wood Screws 1.5 inch',      'Fasteners. Per box of 100',             95.00, 1500, 300, 280, 260),
            ( 7, 'Concrete Nails 3 inch',     'Fasteners. Per 1 kg box',              110.00,  900, 180, 170, 160),
            ( 8, 'Deformed Rebar 10 mm x 6 m','Steel and pipes. Per piece',           185.00, 2000, 450,   0, 400),
            ( 9, 'Deformed Rebar 12 mm x 6 m','Steel and pipes. Per piece',           265.00, 1800, 380, 350, 330),
            (10, 'GI Tie Wire #16',           'Steel and pipes. Per 1 kg roll',        85.00, 1000, 220, 210, 190),
            (11, 'PVC Pipe 2 inch x 3 m',     'Steel and pipes. Per piece',           215.00, 1300, 280, 260, 240),
            (12, 'Corrugated GI Sheet 8 ft',  'Steel and pipes. Per piece',           390.00, 1100, 240, 220, 200),
            (13, 'Latex Paint White 4 L',     'Paint. Per 4 L can',                   780.00,  800, 160, 150, 140),
            (14, 'Paint Thinner 1 L',         'Paint. Per 1 L bottle',                 95.00,  900, 190, 180, 170),
            (15, 'Paint Brush 2 inch',        'Paint. Per piece',                      45.00, 1400, 300, 280, 260),
            (16, 'THHN Wire 2.0 mm2 150 m',   'Electrical. Per 150 m roll',          3450.00,  600, 120, 110, 105),
            (17, 'Circuit Breaker 30 A',      'Electrical. Per piece',                320.00, 1000, 210, 200, 190),
            (18, 'LED Bulb 9 W',              'Electrical. Per piece',                 65.00, 3000,  85, 600, 550),
            (19, 'Extension Cord 5 m',        'Electrical. Per piece',                245.00,  900, 180, 170, 160),
            (20, 'Lavatory Faucet Chrome',    'Plumbing. Per piece',                  280.00,  700, 150, 140, 130),
            (21, 'PVC Elbow 2 inch',          'Plumbing. Per piece',                   22.00, 2800, 600, 560, 520),
            (22, 'Shower Set',                'Plumbing. Per set',                   1150.00,  500, 130, 120, 110),
            (23, 'Claw Hammer 16 oz',         'Tools and safety. Per piece',          220.00,  800, 170, 160, 150),
            (24, 'Hand Saw 20 inch',          'Tools and safety. Per piece',          260.00,  700, 150, 140, 130),
            (25, 'Measuring Tape 5 m',        'Tools and safety. Per piece',          120.00, 1200, 260, 240, 220),
            (26, 'Work Gloves',               'Tools and safety. Per pair',            55.00, 2200, 480, 450, 420),
            (27, 'Safety Helmet',             'Tools and safety. Per piece',          180.00,  900, 190, 180, 170)
        ) AS v(ord, name, descr, price, q_main, q_bogo, q_toledo, q_carcar)
        ORDER BY ord
    LOOP
        SELECT item_id INTO v_item_id FROM items WHERE name = r.name;
        IF v_item_id IS NULL THEN
            next_no := 0;
            LOOP
                next_no := next_no + 1;
                cand := 'SKU-' || CASE WHEN next_no < 1000 THEN lpad(next_no::text, 3, '0')
                                       ELSE next_no::text END;
                EXIT WHEN NOT EXISTS (SELECT 1 FROM items WHERE sku = cand);
            END LOOP;
            INSERT INTO items (sku, name, description, unit_price)
            VALUES (cand, r.name, r.descr, r.price)
            RETURNING item_id INTO v_item_id;
        END IF;

        qtys := ARRAY[r.q_main, r.q_bogo, r.q_toledo, r.q_carcar];
        FOR i IN 1..4 LOOP
            SELECT warehouse_id INTO v_wh_id FROM warehouses WHERE name = wh_names[i];
            -- Already stocked (the file was run before)? Leave it alone.
            CONTINUE WHEN EXISTS (
                SELECT 1 FROM inventory WHERE warehouse_id = v_wh_id AND item_id = v_item_id);
            IF qtys[i] = 0 THEN
                -- Out of stock: the row exists with 0, so it shows in Low stock
                INSERT INTO inventory (warehouse_id, item_id, quantity) VALUES (v_wh_id, v_item_id, 0);
            ELSE
                CALL restock_stock(v_wh_id, v_item_id, qtys[i], admin_id);
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- ---------- 4. Hide the old test data (switched off, never deleted) ----------
UPDATE warehouses SET is_active = false
WHERE name IN ('Cebu Main', 'Davao Branch') AND is_active;

UPDATE items SET is_active = false
WHERE sku = 'SKU-001' AND name = 'Test Item' AND is_active;

-- ---------- 5. Check: one row per warehouse ----------
SELECT w.name AS warehouse, w.city,
       count(*)                                                AS items_stocked,
       sum(i.quantity)                                         AS units,
       count(*) FILTER (WHERE i.quantity < i.reorder_threshold) AS low_stock_items
FROM warehouses w
JOIN inventory i ON i.warehouse_id = w.warehouse_id
WHERE w.is_active
GROUP BY w.name, w.city
ORDER BY w.name;
