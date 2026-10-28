CREATE UNIQUE INDEX IF NOT EXISTS "uq_shipments_active_driver"
ON "shipments" ("driver_id")
WHERE "status" IN ('assigned', 'in_transit');

CREATE UNIQUE INDEX IF NOT EXISTS "uq_shipments_active_vehicle"
ON "shipments" ("vehicle_id")
WHERE "status" IN ('assigned', 'in_transit');
