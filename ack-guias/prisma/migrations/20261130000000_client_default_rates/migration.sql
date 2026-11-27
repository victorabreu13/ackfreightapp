-- A new client starts with the usual charges: 0.15 pickup, 0.20 handling, 0.15 transfer, per kg.
ALTER TABLE "AcctClient" ALTER COLUMN "pickupPerKg" SET DEFAULT 0.15;
ALTER TABLE "AcctClient" ALTER COLUMN "handlingPerKg" SET DEFAULT 0.2;
ALTER TABLE "AcctClient" ALTER COLUMN "transferPerKg" SET DEFAULT 0.15;

-- The clients the system made by itself and nobody configured yet get them too.
UPDATE "AcctClient"
SET "pickupPerKg" = 0.15, "handlingPerKg" = 0.2, "transferPerKg" = 0.15
WHERE "needsSetup" = true AND "pickupPerKg" = 0 AND "handlingPerKg" = 0 AND "transferPerKg" = 0;
