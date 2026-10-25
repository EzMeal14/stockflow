-- =====================================================
-- StockFlow: low stock now means "below 100"
-- Run AFTER 01 to 06. Safe to run more than once.
--
-- The low-stock list shows every item whose quantity is below its reorder level.
-- So the change is: the reorder level is now 100.
--   1. New stock rows start at 100 (the old default was 10).
--   2. Existing stock rows are set to 100.
-- Only data and a column default change. No table or column is added or removed.
-- =====================================================

ALTER TABLE inventory ALTER COLUMN reorder_threshold SET DEFAULT 100;

-- The audit trigger records this change in audit_logs.
-- Stock quantities are not touched, so stock_movements gets no new rows.
UPDATE inventory SET reorder_threshold = 100 WHERE reorder_threshold <> 100;
