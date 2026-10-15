-- =====================================================
-- StockFlow: Tests
-- Run AFTER 01, 02 and 03.
-- IMPORTANT: Do NOT run this whole file at once.
-- Highlight ONE test, then click "Run selected".
-- Each test changes the data, so run each one only once.
-- Starting data: Cebu Main = 0 stock, Davao Branch = 0 stock
-- =====================================================


-- ---------- TEST 1: Restock (adds 50 to Cebu Main) ----------
-- Expected: Success. Cebu Main quantity = 50
CALL restock_stock(
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  50,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Check
SELECT quantity FROM inventory;


-- ---------- TEST 2: Place an order (pending, stock does not change yet) ----------
-- Expected: returns an order id. Stock is still 50.
SELECT place_order(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'Cebu City',
  '[{"item_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","quantity":5}]'
);


-- ---------- TEST 3: Confirm the order (trigger deducts stock) ----------
-- This confirms the newest pending order, so you do not need to copy the id.
-- Expected: Success. Stock = 45
CALL confirm_order(
  (SELECT order_id FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Check
SELECT quantity FROM inventory;


-- ---------- TEST 4: Not enough stock (this one MUST fail) ----------
-- Expected: red error "Not enough stock for item ..."
SELECT place_order(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '11111111-1111-1111-1111-111111111111',
  'Cebu City',
  '[{"item_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","quantity":999}]'
);

-- Check: the failed order was rolled back (still 1 order)
SELECT count(*) FROM orders;


-- ---------- TEST 5: Transfer 10 from Cebu Main to Davao Branch ----------
-- Expected: Success. Cebu Main = 35, Davao Branch = 10
CALL transfer_stock(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  10,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Check
SELECT w.name, i.quantity
FROM inventory i
JOIN warehouses w ON w.warehouse_id = i.warehouse_id;


-- ---------- FINAL CHECKS: logs written by the triggers ----------
-- Expected: restock 50, order_out -5, transfer_out -10, transfer_in 10
SELECT movement_type, quantity_change FROM stock_movements ORDER BY created_at;

-- Expected: rows for users, inventory and orders
SELECT table_name, action FROM audit_logs ORDER BY changed_at;
