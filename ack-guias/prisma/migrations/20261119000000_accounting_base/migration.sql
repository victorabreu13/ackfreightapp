-- DropIndex
DROP INDEX "AirlineRate_airline_destination_key";

-- AlterTable
ALTER TABLE "AirlineRate" ADD COLUMN     "effectiveFrom" DATE NOT NULL DEFAULT '2026-11-01 00:00:00 +00:00';

-- CreateTable
CREATE TABLE "AcctPerson" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "houseShare" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcctUldCost" (
    "uld" TEXT NOT NULL,
    "handlingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bupHandlingCost" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctUldCost_pkey" PRIMARY KEY ("uld")
);

-- CreateTable
CREATE TABLE "AcctSetting" (
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AcctProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pickupMode" TEXT NOT NULL DEFAULT 'manual',
    "pickupTripCost" DOUBLE PRECISION,
    "pickupBaseCost" DOUBLE PRECISION,
    "pickupBasePallets" INTEGER,
    "pickupStepCost" DOUBLE PRECISION,
    "pickupStepPallets" INTEGER,
    "transferMode" TEXT NOT NULL DEFAULT 'manual',
    "transferTripCost" DOUBLE PRECISION,
    "transferBaseCost" DOUBLE PRECISION,
    "transferBasePallets" INTEGER,
    "transferStepCost" DOUBLE PRECISION,
    "transferStepPallets" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcctPerson_name_key" ON "AcctPerson"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AcctProvider_name_key" ON "AcctProvider"("name");

-- CreateIndex
CREATE INDEX "AirlineRate_effectiveFrom_idx" ON "AirlineRate"("effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AirlineRate_airline_destination_effectiveFrom_key" ON "AirlineRate"("airline", "destination", "effectiveFrom");


-- The rates are kept by the short code of the airline, the way the accounting names them.
UPDATE "AirlineRate" SET "airline" = 'AVI' WHERE "airline" = 'Avianca';
UPDATE "AirlineRate" SET "airline" = 'AJT' WHERE "airline" = 'Amerijet';

-- The team that shares in the profit.
INSERT INTO "AcctPerson" ("id", "name", "houseShare", "sortOrder", "updatedAt") VALUES
  (md5('person:Andres'), 'Andres', false, 1, CURRENT_TIMESTAMP),
  (md5('person:Justy'), 'Justy', false, 2, CURRENT_TIMESTAMP),
  (md5('person:Pamela'), 'Pamela', false, 3, CURRENT_TIMESTAMP),
  (md5('person:Victor'), 'Victor', false, 4, CURRENT_TIMESTAMP),
  (md5('person:ACK'), 'ACK', true, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- What handling costs ACK for each ULD, and for a BUP of it.
INSERT INTO "AcctUldCost" ("uld", "handlingCost", "bupHandlingCost", "updatedAt") VALUES
  ('AKE', 35, NULL, CURRENT_TIMESTAMP),
  ('DQF', 50, 40, CURRENT_TIMESTAMP),
  ('FQA', 35, 30, CURRENT_TIMESTAMP),
  ('LOOSE', 0, 0, CURRENT_TIMESTAMP),
  ('PAG', 50, 50, CURRENT_TIMESTAMP),
  ('PMC', 50, 50, CURRENT_TIMESTAMP)
ON CONFLICT ("uld") DO NOTHING;

-- The minimums charged on the sell side.
INSERT INTO "AcctSetting" ("key", "value", "updatedAt") VALUES
  ('minPickupSold', 75, CURRENT_TIMESTAMP),
  ('minTransferSold', 75, CURRENT_TIMESTAMP),
  ('minHandlingSold', 75, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- Who does the pickups and the transfers. ACK TEAM LLC charges one price per trip. RL Services charges a base price for
-- the first 4 pallets and then a step price for each further 2 pallets, or each further pallet or piece. The transfer of
-- RL Services is typed on the shipment until its prices are known.
INSERT INTO "AcctProvider" ("id", "name", "pickupMode", "pickupTripCost", "transferMode", "transferTripCost", "sortOrder", "updatedAt") VALUES
  (md5('provider:ACK Team LLC'), 'ACK Team LLC', 'per_trip', 40, 'per_trip', 40, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctProvider" ("id", "name", "pickupMode", "pickupBaseCost", "pickupBasePallets", "pickupStepCost", "pickupStepPallets", "transferMode", "sortOrder", "updatedAt") VALUES
  (md5('provider:RL Services'), 'RL Services', 'tiered', 50, 4, 10, 2, 'manual', 2, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
