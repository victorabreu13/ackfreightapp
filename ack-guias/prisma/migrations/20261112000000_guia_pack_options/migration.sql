-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "aircraft" TEXT,
ADD COLUMN     "screened" BOOLEAN NOT NULL DEFAULT false;
