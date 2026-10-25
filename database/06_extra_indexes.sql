-- =====================================================
-- StockFlow: extra index found by the benchmark (see docs/benchmark_report.md)
-- Run AFTER 01 to 05. Safe to run more than once.
-- Adds an index only. No table changes, so it fits the code freeze rules.
-- =====================================================

-- Stock history screen: "newest 50 movements" (GET /stock/movements)
CREATE INDEX IF NOT EXISTS idx_movements_created_at
    ON stock_movements (created_at DESC);
