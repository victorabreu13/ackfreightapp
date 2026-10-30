-- CreateTable
CREATE TABLE "TruckDriver" (
    "id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "license" TEXT,
    "phone" TEXT,
    "carrierKey" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TruckDriver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TruckDriver_carrierKey_nameKey_key" ON "TruckDriver"("carrierKey", "nameKey");

