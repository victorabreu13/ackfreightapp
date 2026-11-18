-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "masterId" TEXT;

-- CreateTable
CREATE TABLE "HouseCounter" (
    "key" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HouseCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AirWaybillDocument_masterId_idx" ON "AirWaybillDocument"("masterId");

-- AddForeignKey
ALTER TABLE "AirWaybillDocument" ADD CONSTRAINT "AirWaybillDocument_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "AirWaybillDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

