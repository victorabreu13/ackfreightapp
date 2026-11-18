-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "bup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dgDeclarable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unNumbers" TEXT;

