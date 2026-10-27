# StockFlow Query Benchmark Report

**Owner:** Manong (Lead Database Programmer and Optimizer)
**Database:** PostgreSQL on Supabase (free plan)
**Scripts:** `database/benchmark.sql`, `database/06_extra_indexes.sql`

## 1. Goal

Show that the indexes in `01_schema.sql` make the app's real queries faster, and find out if any query needs a better index.

## 2. Method

- The real tables only hold a few rows. PostgreSQL does not use an index on a tiny table, so a test there proves nothing.
- `benchmark.sql` builds a copy of the main tables in a separate schema called `bench`, fills it with fake data, and times each query with `EXPLAIN (ANALYZE, BUFFERS)`.
- Step 1: run the 7 queries with **no indexes** (only primary keys).
- Step 2: add the **same indexes** as the real database and run the same 7 queries again.
- Each query was run **twice**, and the **second** run is reported, because the first run can be slower while the data is read from disk.
- The `bench` schema was deleted afterwards. The real tables were never touched.

## 3. Test data

| Table | Rows |
|---|---|
| orders | 100,000 |
| order_items | 300,000 |
| inventory | 50,000 (about 2% below the reorder level) |
| stock_movements | 200,000 |
| shipments | 50,000 |
| audit_logs | 200,000 |

## 4. Queries tested

| # | Screen and route | Index it should use |
|---|---|---|
| Q1 | Client dashboard: own orders (`GET /orders`) | `idx_orders_client` |
| Q2 | Staff dashboard: orders of one warehouse (`GET /orders`) | `idx_orders_warehouse` |
| Q3 | Stock history of one warehouse, newest 50 (`GET /stock/movements`) | `idx_movements_inventory`, and `idx_movements_created_at` (new) |
| Q4 | Low-stock report (`GET /stock/low`, view `v_low_stock`) | `idx_inventory_low_stock` (partial index) |
| Q5 | Audit trail of one order | `idx_audit_table_record` |
| Q6 | Driver dashboard: open shipments (`GET /shipments`) | `idx_shipments_driver` |
| Q7 | Lines of one order (`GET /orders/:id`) | `idx_order_items_order` |

The exact SQL for each query is in `database/benchmark.sql`, block 4.

## 5. Results

Fill the **bold** cells from your own run in Supabase. Gain = Before / After.

| # | Plan before (scan type) | Plan after (scan type) | Before (ms) | After (ms) | Gain |
|---|---|---|---|---|---|
| Q1 | **Seq Scan** | **fill in** | **fill in** | **fill in** | **fill in** |
| Q2 | **Seq Scan** | **fill in** | **fill in** | **fill in** | **fill in** |
| Q3 | **fill in** | **fill in** | **fill in** | **fill in** | **fill in** |
| Q4 | **Seq Scan** | **fill in** | **fill in** | **fill in** | **fill in** |
| Q5 | **Seq Scan** | **fill in** | **fill in** | **fill in** | **fill in** |
| Q6 | **Seq Scan** | **fill in** | **fill in** | **fill in** | **fill in** |
| Q7 | **Seq Scan** | **fill in** | **fill in** | **fill in** | **fill in** |

How to read a plan:

- **Seq Scan** means PostgreSQL read the whole table.
- **Index Scan** or **Bitmap Index Scan** means it used an index.
- **Execution Time** is the last line of the plan.

Screenshots of the "before" and "after" plans for at least Q1, Q3, and Q5 go in `docs/screenshots/`.

## 6. Extra index tests

| Test | Index tried | Time before (ms) | Time after (ms) | Decision |
|---|---|---|---|---|
| 7a, Q2 | `orders (warehouse_id, created_at DESC)` | **fill in** | **fill in** | **Add only if the time drops a lot. Otherwise: not added.** |
| 7b, Q3 | `stock_movements (created_at DESC)` | **fill in** | **fill in** | **Add only if the time drops a lot.** |

Why 7b is worth testing: the history screen needs the newest 50 rows for a whole warehouse. The index `(inventory_id, created_at)` cannot give rows in date order across many `inventory_id` values. An index on `created_at` lets PostgreSQL read the newest rows first and stop after 50.

If 7b is confirmed, run `database/06_extra_indexes.sql` on the real database.

## 7. Index sizes

Run block 8 of `benchmark.sql` and paste the result here.

| Index | Size |
|---|---|
| **fill in** | **fill in** |

## 8. Conclusion

- **fill in:** which indexes made a large difference, and by how much.
- **fill in:** which index was added after the test (`idx_movements_created_at`) and why.
- **fill in:** which index was tried and not added (`orders (warehouse_id, created_at DESC)`) and why.
- Trade-off: every index uses disk space and makes inserts a little slower, so we only keep the ones that help a real query.

## 9. How to repeat the test

1. Open the Supabase SQL Editor.
2. Run `database/benchmark.sql` one block at a time, from block 0 to block 8.
3. Run block 9 to delete the test schema.
