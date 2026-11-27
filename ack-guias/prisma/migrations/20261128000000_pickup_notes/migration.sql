-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "pickupNotes" TEXT;

-- The notes of each pickup request go to the guía it started, where the pickup order reads them.
UPDATE "AirWaybillDocument" AS d SET "pickupNotes" = p."notes" FROM "PickupRequest" AS p WHERE p."guiaId" = d."id" AND p."notes" IS NOT NULL AND p."notes" <> '';
