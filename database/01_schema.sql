-- =====================================================
-- StockFlow: Multi-Branch Warehouse & Shipment Tracker
-- File 1 of 2: Tables, constraints, indexes, view
-- Database: PostgreSQL (Supabase / Neon)
-- Run this first. Then run 02_triggers_procedures.sql
-- =====================================================

-- ---------- ENUM TYPES (fixed lists of allowed values) ----------
CREATE TYPE user_role       AS ENUM ('admin', 'staff', 'driver', 'client');
CREATE TYPE order_status    AS ENUM ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled');
CREATE TYPE shipment_status AS ENUM ('assigned', 'in_transit', 'delivered', 'failed');
CREATE TYPE movement_type   AS ENUM ('restock', 'order_out', 'transfer_in', 'transfer_out', 'adjustment');
CREATE TYPE audit_action    AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- ---------- 1. warehouses ----------
CREATE TABLE warehouses (
    warehouse_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         varchar(200) NOT NULL,
    address      text         NOT NULL,
    city         varchar(120) NOT NULL,
    photo_data   text,
    is_active    boolean      NOT NULL DEFAULT true
);

-- ---------- 2. users ----------
CREATE TABLE users (
    user_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firstname     varchar(200) NOT NULL,
    lastname      varchar(200) NOT NULL,
    email         varchar(255) NOT NULL UNIQUE,
    password_hash text         NOT NULL,
    role          user_role    NOT NULL,
    warehouse_id  uuid,                              -- only used by warehouse staff
    contact_number varchar(20),                      -- phone number of drivers and staff
    photo_data   text,
    is_available  boolean      NOT NULL DEFAULT true,
    is_active     boolean      NOT NULL DEFAULT true,
    session_version integer    NOT NULL DEFAULT 0,
    created_at    timestamp    NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_contact_number
        CHECK (contact_number IS NULL OR contact_number ~ '^\+?[0-9]{7,15}$'),
    CONSTRAINT fk_users_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses (warehouse_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ---------- 3. items ----------
CREATE TABLE items (
    item_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id          varchar(100)  NOT NULL UNIQUE,
    name        varchar(200)  NOT NULL,
    description text,
    image_data  text,
    unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    is_active   boolean       NOT NULL DEFAULT true
);

-- ---------- 4. inventory (junction: warehouses <-> items) ----------
CREATE TABLE inventory (
    inventory_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id      uuid      NOT NULL,
    item_id           uuid      NOT NULL,
    quantity          integer   NOT NULL DEFAULT 0,
    reorder_threshold integer   NOT NULL DEFAULT 100 CHECK (reorder_threshold >= 0),
    updated_at        timestamp NOT NULL DEFAULT now(),
    CONSTRAINT chk_inventory_quantity CHECK (quantity >= 0),       -- no negative stock
    CONSTRAINT uq_inventory_wh_item   UNIQUE (warehouse_id, item_id),
    CONSTRAINT fk_inventory_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses (warehouse_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_inventory_item
        FOREIGN KEY (item_id) REFERENCES items (item_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------- 5. orders ----------
CREATE TABLE orders (
    order_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        uuid         NOT NULL,
    warehouse_id     uuid         NOT NULL,
    status           order_status NOT NULL DEFAULT 'pending',
    payment_status   varchar(20)  NOT NULL DEFAULT 'not_required',
    payment_checkout_id varchar(100) UNIQUE,
    delivery_address text         NOT NULL,
    created_at       timestamp    NOT NULL DEFAULT now(),
    CONSTRAINT fk_orders_client
        FOREIGN KEY (client_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_orders_warehouse
        FOREIGN KEY (warehouse_id) REFERENCES warehouses (warehouse_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------- 6. order_items (junction: orders <-> items) ----------
CREATE TABLE order_items (
    order_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      uuid          NOT NULL,
    item_id       uuid          NOT NULL,
    quantity      integer       NOT NULL CHECK (quantity > 0),
    unit_price    numeric(12,2) NOT NULL CHECK (unit_price >= 0),   -- price at time of order
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_order_items_item
        FOREIGN KEY (item_id) REFERENCES items (item_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------- 7. vehicles ----------
CREATE TABLE vehicles (
    vehicle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plate      varchar(30) NOT NULL UNIQUE,
    type       varchar(80) NOT NULL,
    is_active  boolean     NOT NULL DEFAULT true
);

-- ---------- 8. shipments ----------
CREATE TABLE shipments (
    shipment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      uuid            NOT NULL,
    driver_id     uuid            NOT NULL,
    vehicle_id    uuid            NOT NULL,
    status        shipment_status NOT NULL DEFAULT 'assigned',
    dispatched_at timestamp,
    delivered_at  timestamp,
    CONSTRAINT fk_shipments_order
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_shipments_driver
        FOREIGN KEY (driver_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_shipments_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles (vehicle_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------- 9. stock_movements ----------
CREATE TABLE stock_movements (
    movement_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id    uuid          NOT NULL,
    movement_type   movement_type NOT NULL,
    quantity_change integer       NOT NULL CHECK (quantity_change <> 0),
    performed_by    uuid          NOT NULL,
    created_at      timestamp     NOT NULL DEFAULT now(),
    CONSTRAINT fk_movements_inventory
        FOREIGN KEY (inventory_id) REFERENCES inventory (inventory_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_movements_user
        FOREIGN KEY (performed_by) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ---------- 10. audit_logs (filled by triggers only) ----------
CREATE TABLE audit_logs (
    log_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name varchar(100) NOT NULL,
    record_id  uuid,
    action     audit_action NOT NULL,
    old_value  jsonb,
    new_value  jsonb,
    changed_by uuid,
    changed_at timestamp    NOT NULL DEFAULT now(),
    CONSTRAINT fk_audit_user
        FOREIGN KEY (changed_by) REFERENCES users (user_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ---------- INDEXES (speed up joins and reports) ----------
CREATE INDEX idx_users_warehouse        ON users (warehouse_id);
CREATE INDEX idx_orders_client          ON orders (client_id);
CREATE INDEX idx_orders_warehouse       ON orders (warehouse_id, status);
CREATE INDEX idx_order_items_order      ON order_items (order_id);
CREATE INDEX idx_shipments_order        ON shipments (order_id);
CREATE INDEX idx_shipments_driver       ON shipments (driver_id, status);
CREATE INDEX idx_movements_inventory    ON stock_movements (inventory_id, created_at);
CREATE INDEX idx_audit_table_record     ON audit_logs (table_name, record_id);
CREATE INDEX idx_audit_changed_at       ON audit_logs (changed_at);
-- Only indexes rows that are low on stock (fast low-stock report)
CREATE INDEX idx_inventory_low_stock    ON inventory (warehouse_id) WHERE quantity < reorder_threshold;

-- ---------- LOW-STOCK ALERT VIEW (no extra table needed) ----------
CREATE OR REPLACE VIEW v_low_stock AS
SELECT w.warehouse_id,
       w.name        AS warehouse,
       i.id,
       i.name        AS item,
       inv.quantity,
       inv.reorder_threshold
FROM inventory inv
JOIN warehouses w ON w.warehouse_id = inv.warehouse_id
JOIN items      i ON i.item_id      = inv.item_id
WHERE inv.quantity < inv.reorder_threshold;

-- Make the view follow the caller's permissions (fixes UNRESTRICTED tag in Supabase)
ALTER VIEW public.v_low_stock SET (security_invoker = true);