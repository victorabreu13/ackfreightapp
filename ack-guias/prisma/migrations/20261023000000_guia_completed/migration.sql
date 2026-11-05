-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedBy" TEXT;
