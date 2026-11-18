-- AlterTable
ALTER TABLE "AcctProvider" ADD COLUMN     "pickupCap" DOUBLE PRECISION,
ADD COLUMN     "transferCap" DOUBLE PRECISION;


-- RL Services transfer to the airline, per guía: $40 for the first pallet or piece, $20 for each more, never above $150.
UPDATE "AcctProvider" SET "transferMode" = 'tiered', "transferBaseCost" = 40, "transferBasePallets" = 1, "transferStepCost" = 20, "transferStepPallets" = 1, "transferCap" = 150 WHERE "name" = 'RL SERVICES & TRANSPORT LLC';
