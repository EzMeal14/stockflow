# StockFlow Data Dictionary

**System:** StockFlow, Multi-Branch Warehouse & Shipment Tracker
**Database:** PostgreSQL (Supabase)
**Source files:** `database/01_schema.sql` to `database/05_roles_policies.sql`

All foreign keys also use `ON UPDATE CASCADE`. Primary keys are `uuid` with a default of `gen_random_uuid()`.

## 1. Tables at a Glance

| # | Table | What it stores | Type |
|---|---|---|---|
| 1 | `warehouses` | Warehouse branches | Main |
| 2 | `users` | All people who log in (admin, staff, driver, client) | Main |
| 3 | `items` | Products in the catalog | Main |
| 4 | `inventory` | Stock of each item in each warehouse | **Junction** (warehouses and items) |
| 5 | `orders` | Customer orders | Main |
| 6 | `order_items` | Items inside each order | **Junction** (orders and items) |
| 7 | `vehicles` | Delivery vehicles | Main |
| 8 | `shipments` | Deliveries, with a driver and a vehicle | Main |
| 9 | `stock_movements` | History of every stock change | Log |
| 10 | `audit_logs` | History of data changes (filled by triggers) | Log |

**Junction tables with their own columns**

- `inventory` links warehouses and items. It adds `quantity`, `reorder_threshold`, and `updated_at`.
- `order_items` links orders and items. It adds `quantity` and `unit_price`.

## 2. Enum Types

| Type | Allowed values | Used in |
|---|---|---|
| `user_role` | admin, staff, driver, client | `users.role` |
| `order_status` | pending, confirmed, dispatched, delivered, cancelled | `orders.status` |
| `shipment_status` | assigned, in_transit, delivered, failed | `shipments.status` |
| `movement_type` | restock, order_out, transfer_in, transfer_out, adjustment | `stock_movements.movement_type` |
| `audit_action` | INSERT, UPDATE, DELETE | `audit_logs.action` |

## 3. Table Details

Key: **PK** = primary key, **FK** = foreign key, **UQ** = unique, **NN** = not null.

### 3.1 warehouses

A branch where stock is kept.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| warehouse_id | uuid | PK | NN | generated | Unique ID of the warehouse |
| name | varchar(200) | | NN | | Warehouse name |
| address | text | | NN | | Street address |
| city | varchar(120) | | NN | | City |
| is_active | boolean | | NN | true | false = closed (soft delete) |

### 3.2 users

Every person in the system. The `role` decides which dashboard and data they get.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| user_id | uuid | PK | NN | generated | Unique ID of the user |
| firstname | varchar(200) | | NN | | First name |
| lastname | varchar(200) | | NN | | Last name |
| email | varchar(255) | UQ | NN | | Login email, no duplicates |
| password_hash | text | | NN | | Hashed password, never plain text |
| role | user_role | | NN | | admin, staff, driver, or client |
| warehouse_id | uuid | FK | Yes | | Assigned warehouse (used by staff only) |
| contact_number | varchar(20) | | Yes | | Phone number of drivers and staff. Digits only, with an optional + at the start (7 to 15 digits) |
| is_active | boolean | | NN | true | false = account disabled |
| created_at | timestamp | | NN | now() | When the account was made |

### 3.3 items

A product that can be stocked and ordered.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| item_id | uuid | PK | NN | generated | Unique ID of the item |
| id | varchar(100) | UQ | NN | | Stable human-readable item ID; unchanged by renaming, deactivation, or restoration. UUID `item_id` references also remain stable |
| name | varchar(200) | | NN | | Item name |
| description | text | | Yes | | Optional details |
| unit_price | numeric(12,2) | | NN | | Current price. Must be 0 or more |
| is_active | boolean | | NN | true | false = no longer sold |

### 3.4 inventory (junction)

How many units of one item are in one warehouse.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| inventory_id | uuid | PK | NN | generated | Unique ID of the stock record |
| warehouse_id | uuid | FK | NN | | Which warehouse |
| item_id | uuid | FK | NN | | Which item |
| quantity | integer | | NN | 0 | Units in stock. **Cannot go below 0** |
| reorder_threshold | integer | | NN | 100 | Low-stock level. Must be 0 or more |
| updated_at | timestamp | | NN | now() | Last change (set by trigger) |

**Rule:** `UNIQUE (warehouse_id, item_id)` means one row per item per warehouse.

### 3.5 orders

An order placed by a client at one warehouse.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| order_id | uuid | PK | NN | generated | Unique ID of the order |
| client_id | uuid | FK | NN | | The client who ordered |
| warehouse_id | uuid | FK | NN | | Warehouse that fills the order |
| status | order_status | | NN | pending | Where the order is now |
| delivery_address | text | | NN | | Where to deliver |
| created_at | timestamp | | NN | now() | When it was placed |

### 3.6 order_items (junction)

One line in an order.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| order_item_id | uuid | PK | NN | generated | Unique ID of the line |
| order_id | uuid | FK | NN | | Which order |
| item_id | uuid | FK | NN | | Which item |
| quantity | integer | | NN | | Units ordered. Must be more than 0 |
| unit_price | numeric(12,2) | | NN | | Price at the time of the order. Must be 0 or more |

### 3.7 vehicles

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| vehicle_id | uuid | PK | NN | generated | Unique ID of the vehicle |
| plate | varchar(30) | UQ | NN | | Plate number, no duplicates |
| type | varchar(80) | | NN | | Van, truck, motorcycle, and so on |
| is_active | boolean | | NN | true | false = out of service |

### 3.8 shipments

A delivery for an order, done by one driver in one vehicle.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| shipment_id | uuid | PK | NN | generated | Unique ID of the shipment |
| order_id | uuid | FK | NN | | The order being delivered |
| driver_id | uuid | FK | NN | | The driver (a user with role driver) |
| vehicle_id | uuid | FK | NN | | The vehicle used |
| status | shipment_status | | NN | assigned | Delivery progress |
| dispatched_at | timestamp | | Yes | | When it left. Empty until dispatched |
| delivered_at | timestamp | | Yes | | When it arrived. Empty until delivered |

### 3.9 stock_movements

A log of every change to stock. Triggers fill it, so nobody edits it by hand.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| movement_id | uuid | PK | NN | generated | Unique ID of the movement |
| inventory_id | uuid | FK | NN | | Which stock record changed |
| movement_type | movement_type | | NN | | Why it changed |
| quantity_change | integer | | NN | | Amount added (+) or removed (-). Cannot be 0 |
| performed_by | uuid | FK | NN | | The user who did it |
| created_at | timestamp | | NN | now() | When it happened |

### 3.10 audit_logs

A log of data changes (who, what, when). Triggers fill it.

| Column | Type | Key | Null? | Default | Meaning |
|---|---|---|---|---|---|
| log_id | uuid | PK | NN | generated | Unique ID of the log entry |
| table_name | varchar(100) | | NN | | Table that changed |
| record_id | uuid | | Yes | | ID of the row that changed |
| action | audit_action | | NN | | INSERT, UPDATE, or DELETE |
| old_value | jsonb | | Yes | | Row before the change (password hash removed) |
| new_value | jsonb | | Yes | | Row after the change (password hash removed) |
| changed_by | uuid | FK | Yes | | The user who made the change |
| changed_at | timestamp | | NN | now() | When it happened |

## 4. Relationships and Delete Rules

| From (one) | To (many) | Column | ON DELETE | Meaning |
|---|---|---|---|---|
| warehouses | users | users.warehouse_id | SET NULL | Deleting a warehouse clears the staff assignment |
| warehouses | inventory | inventory.warehouse_id | RESTRICT | A warehouse with stock cannot be deleted |
| items | inventory | inventory.item_id | RESTRICT | An item with stock cannot be deleted |
| users | orders | orders.client_id | RESTRICT | A client with orders cannot be deleted |
| warehouses | orders | orders.warehouse_id | RESTRICT | A warehouse with orders cannot be deleted |
| orders | order_items | order_items.order_id | CASCADE | Deleting an order deletes its lines |
| items | order_items | order_items.item_id | RESTRICT | An ordered item cannot be deleted |
| orders | shipments | shipments.order_id | RESTRICT | An order with shipments cannot be deleted |
| users | shipments | shipments.driver_id | RESTRICT | A driver with shipments cannot be deleted |
| vehicles | shipments | shipments.vehicle_id | RESTRICT | A vehicle with shipments cannot be deleted |
| inventory | stock_movements | stock_movements.inventory_id | RESTRICT | Stock with history cannot be deleted |
| users | stock_movements | stock_movements.performed_by | RESTRICT | A user with stock history cannot be deleted |
| users | audit_logs | audit_logs.changed_by | SET NULL | Deleting a user keeps the log, with the user cleared |

**Soft delete:** For users, items, warehouses, and vehicles, set `is_active = false` instead of deleting the row.

## 5. Other Constraints

| Table | Constraint | Rule |
|---|---|---|
| inventory | `chk_inventory_quantity` | `quantity >= 0` (no negative stock) |
| inventory | `uq_inventory_wh_item` | One row per warehouse and item |
| inventory | check | `reorder_threshold >= 0` |
| items | check | `unit_price >= 0` |
| order_items | check | `quantity > 0` and `unit_price >= 0` |
| stock_movements | check | `quantity_change <> 0` |
| users | unique | `email` |
| items | unique | `id` |
| vehicles | unique | `plate` |

## 6. View

| View | What it shows |
|---|---|
| `v_low_stock` | Items where `quantity < reorder_threshold`, with warehouse name and item ID. It follows the caller's permissions (`security_invoker = true`). |

## 7. Triggers

| Trigger | Table | When | What it does |
|---|---|---|---|
| `trg_audit_users` | users | After insert, update, delete | Writes to `audit_logs` |
| `trg_audit_inventory` | inventory | After insert, update, delete | Writes to `audit_logs` |
| `trg_audit_orders` | orders | After insert, update, delete | Writes to `audit_logs` |
| `trg_audit_shipments` | shipments | After insert, update, delete | Writes to `audit_logs` |
| `trg_inventory_movement` | inventory | After `quantity` changes | Writes a row to `stock_movements` |
| `trg_order_confirm_deduct` | orders | When status goes from pending to confirmed | Deducts the ordered quantities from `inventory` |
| `trg_inventory_touch` | inventory | Before update | Sets `updated_at` to now |

The triggers read two session values: `app.user_id` (who made the change) and `app.movement_type` (why stock changed).

## 8. Stored Procedures and Functions

| Name | Kind | Inputs | What it does |
|---|---|---|---|
| `place_order` | Function | client, warehouse, address, items (JSON) | Checks stock and creates a pending order with its lines. Returns the order ID |
| `confirm_order` | Procedure | order ID, user ID | Changes status to confirmed. The trigger then deducts stock |
| `transfer_stock` | Procedure | from warehouse, to warehouse, item, quantity, user ID | Moves stock between warehouses in one transaction, with row locks |
| `restock_stock` | Procedure | warehouse, item, quantity, user ID | Adds stock to a warehouse |

## 9. Database Roles and Security

| Role | Login? | Permissions |
|---|---|---|
| `stockflow_app` | Yes | Read, insert, and update the main tables. **No delete.** Read-only on `stock_movements` and `audit_logs`. Can run the four procedures and functions. Cannot change the structure |

- `stockflow_app` is not a superuser and cannot create roles or databases.
- Row Level Security is on for every table. `stockflow_app` has a policy on each table.
- The application connects with `stockflow_app` only, never with the admin account.
- Passwords and connection strings are never stored in the repository.

## 10. Indexes

| Index | Table and columns |
|---|---|
| `idx_users_warehouse` | users (warehouse_id) |
| `idx_orders_client` | orders (client_id) |
| `idx_orders_warehouse` | orders (warehouse_id, status) |
| `idx_order_items_order` | order_items (order_id) |
| `idx_shipments_order` | shipments (order_id) |
| `idx_shipments_driver` | shipments (driver_id, status) |
| `idx_movements_inventory` | stock_movements (inventory_id, created_at) |
| `idx_audit_table_record` | audit_logs (table_name, record_id) |
| `idx_audit_changed_at` | audit_logs (changed_at) |
| `idx_inventory_low_stock` | inventory (warehouse_id) where `quantity < reorder_threshold` |

Primary key and unique constraints also create their own indexes.
