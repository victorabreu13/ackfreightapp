-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "pickupTruckerName" TEXT;

-- AlterTable
ALTER TABLE "AcctProvider" ADD COLUMN     "aliases" TEXT;

-- AlterTable
ALTER TABLE "AcctShipment" ADD COLUMN     "pickupProvider" TEXT,
ADD COLUMN     "transferProvider" TEXT;


-- A trucker is recognised as a provider by these names, which are matched without capitals or punctuation.
UPDATE "AcctProvider" SET "aliases" = 'ACK TEAM, ACK LOGISTICS' WHERE "name" = 'ACK Team LLC' AND "aliases" IS NULL;
UPDATE "AcctProvider" SET "aliases" = 'RL SERVICES, RL SERVICE' WHERE "name" = 'RL Services' AND "aliases" IS NULL;
