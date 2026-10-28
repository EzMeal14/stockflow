# BuildStock

**Hardware & Construction Supplies Distributor**
Course project for Advanced Database Systems.

BuildStock supplies hardware stores and contractors across warehouse branches. Warehouses hold the stock and trucks deliver supplies to stores or job sites. The system keeps inventory and deliveries correct across every location. The database does the hard work: it blocks negative stock, logs every change, and the API only calls it.

## Tech Stack

| Layer | Tool |
|---|---|
| Database | PostgreSQL on Supabase (cloud) |
| Backend | Node.js, Express, Prisma |
| Login | bcrypt password hashes and JWT tokens |
| Frontend | HTML, CSS, JavaScript that calls the API (in progress) |
| Version control | Git and GitHub (branch protection, Pull Requests) |

## Team and Roles

| Member | Role |
|---|---|
| Cute | Lead DBA (schema, delete rules, data dictionary) |
| Yandee | Cloud and Security Engineer (hosting, database roles, firewall, backups) |
| Manong | Lead Database Programmer and Optimizer (triggers, procedures, indexes) |
| Jesse | Frontend Connector and Git Administrator |

## Folder Layout

```
stockflow/
├── database/        SQL files, run in order (see below)
├── docs/            data_dictionary.md
└── backend/
    ├── index.js     starts the server
    ├── app.js       sets up Express and the routes
    ├── routes/      the URLs
    ├── controllers/ the logic
    ├── lib/         shared code (database client, login checks, error handling)
    ├── prisma/      schema.prisma (read from the database)
    └── scripts/     seed-users.js (demo accounts)
```

## Database Files

Run these in the Supabase SQL Editor, in order, and only once each.

| File | What it does |
|---|---|
| `01_schema.sql` | Tables, constraints, indexes, and the low-stock view |
| `02_triggers_procedures.sql` | Audit and stock triggers, and the stored procedures |
| `03_sample_data.sql` | Optional demo data |
| `04_tests.sql` | Optional tests. Run one test at a time, not the whole file |
| `05_roles_policies.sql` | The limited `stockflow_app` role. Change `CHANGE_ME` to a real password first, and never commit the real one |
| `10_rename_sku_to_id.sql` | Existing databases only: renames the item code column to `id` and changes `SKU-` values to `ID-` |

Before deploying the item-ID backend update to an existing database, run
`10_rename_sku_to_id.sql` in the Supabase SQL Editor. It checks for ID
conflicts and rolls back rather than overwriting duplicate values. New databases
should use `01_schema.sql` and do not need this migration.

The data dictionary is in `docs/data_dictionary.md`.

## Run the Backend

1. Clone the repo and go into the backend folder:

```
git clone https://github.com/EzMeal14/stockflow.git
cd stockflow/backend
npm install
```

2. Create a file named `backend/.env` with these 3 lines. **Never commit this file.**

```
DATABASE_URL="postgresql://stockflow_app.PROJECT_ID:PASSWORD@HOST:5432/postgres"
JWT_SECRET="a long random text"
SEED_PASSWORD="a demo password of 8 or more characters"
```

- Get `DATABASE_URL` from the DBA, privately. It uses the limited `stockflow_app` role, never an admin account.
- Make `JWT_SECRET` with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

3. Generate the Prisma client, make the demo accounts, and start the server:

```
npx prisma generate
node scripts/seed-users.js
node index.js
```

The API runs on `http://localhost:3000`. The database itself is in the cloud.

## Publish the Frontend on GitHub Pages

In the repository settings, open **Pages** and set the build and deployment source to **GitHub Actions**. The Pages workflow publishes the `frontend/` directory when changes are pushed to `main`; it can also be started manually from the Actions tab.

GitHub Pages hosts only the static frontend. The frontend currently calls `http://localhost:3000`, so the hosted pages will not connect to a live API. To make the app fully functional online, host the backend separately, set `API_BASE` in `frontend/js/config.js` to its public URL, and allow the Pages origin in the backend's CORS configuration. Do not put database credentials or other secrets in frontend files.

## User Roles

| Role | Can do |
|---|---|
| **admin** | Everything. Manages items, warehouses, vehicles, and sees all data |
| **staff** | Own warehouse only: stock, restock, transfer out, confirm orders, shipments. Cannot see prices |
| **driver** | Own shipments only. Moves them to in transit, then delivered |
| **client** | Browses items with prices, places orders, sees own orders |

Anyone who registers becomes a **client**. Other roles are set in the database.

## API Routes

Send the login token in the header: `Authorization: Bearer YOUR_TOKEN`. Only `/auth` routes work without it.

| Area | Routes | Who |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login` | Anyone |
| Items | `GET /items`, `GET /items/:id` | admin, staff, client |
| | `GET /items/catalog` (active and deactivated items for client stock reference) | client |
| | `GET /items/admin-catalog` (active items with total stock across warehouses) | admin |
| | `GET /items/inactive` (deactivated items with total stock across warehouses) | admin |
| | `POST /items/:id/restore`, `DELETE /items/:id/permanent` | admin |
| | `POST /items`, `PUT /items/:id`, `DELETE /items/:id` (deactivate) | admin |

Permanently deleting an inactive item is allowed only if it has no inventory or
order-item references. Items with stock or order history must remain deactivated
so their related records are preserved.
| Warehouses | `GET /warehouses` | admin, staff (own), client (name and city) |
| | `GET /warehouses/:id`, `GET /warehouses/:id/inventory` | admin, staff (own) |
| | `POST /warehouses`, `PUT /warehouses/:id`, `DELETE /warehouses/:id` | admin |
| Orders | `GET /orders`, `GET /orders/:id` | Each role sees its own scope |
| | `POST /orders` | client, admin |
| | `POST /orders/:id/confirm` | admin, staff |
| Vehicles | `GET /vehicles` | admin, staff, driver |
| | `POST /vehicles`, `PUT /vehicles/:id`, `DELETE /vehicles/:id` | admin |
| Shipments | `GET /shipments`, `GET /shipments/:id` | admin, staff, driver (own) |
| | `POST /shipments` | admin, staff |
| | `PATCH /shipments/:id/status` | admin, driver |
| Stock | `POST /stock/restock`, `POST /stock/transfer` | admin, staff |
| | `GET /stock/low`, `GET /stock/movements` | admin, staff |

`DELETE` routes do a soft delete (`is_active = false`). The app role has no delete right.

## How Orders Work

1. A client sends `POST /orders`. The database function `place_order` checks the stock and makes a **pending** order.
2. Staff send `POST /orders/:id/confirm`. The procedure `confirm_order` runs.
3. A database trigger deducts the stock. A check rule rejects anything below 0.
4. Stock triggers write `stock_movements`, and audit triggers write `audit_logs`, with the user's ID.
5. Staff create a shipment. The driver moves it to `in_transit`, then `delivered`, and the order status follows.

## Security

- The app connects with the limited `stockflow_app` role. It is not a superuser and cannot change tables or delete rows.
- Prisma sends every value as a parameter (prepared statements), so SQL injection is blocked.
- Passwords are hashed with bcrypt. Password hashes are removed from audit logs.
- The user and role are checked in the database on every request. The user's ID comes from the token, never from the request body.
- Row Level Security is on for every table.
- `.env` is in `.gitignore` and is never committed.

## Git Workflow

- Never push to `main`. It is protected.
- One feature per branch, for example `feature/stock-routes`.
- Merge only through a Pull Request approved by another member.
- Use clear commit messages, for example `feat: add trigger for stock history` or `fix: correct error message`.
