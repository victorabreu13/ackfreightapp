-- CreateTable
CREATE TABLE "PickupRequest" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "clientLabel" TEXT NOT NULL,
    "shipperName" TEXT NOT NULL,
    "shipperAddress" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "consigneeName" TEXT,
    "consigneeAddress" TEXT,
    "destination" TEXT,
    "pieces" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "description" TEXT,
    "pickupDate" TEXT,
    "readyTime" TEXT,
    "truckerName" TEXT,
    "truckerPhone" TEXT,
    "driverName" TEXT,
    "notes" TEXT,
    "guiaId" TEXT,

    CONSTRAINT "PickupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseReceipt" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warehouse" TEXT NOT NULL DEFAULT 'Warehouse 2 - Site 1',
    "receivedBy" TEXT,
    "clientLabel" TEXT,
    "shipperName" TEXT,
    "shipperAddress" TEXT,
    "consigneeName" TEXT,
    "consigneeAddress" TEXT,
    "carrier" TEXT,
    "driver" TEXT,
    "driverLicense" TEXT,
    "supplier" TEXT,
    "invoiceNumber" TEXT,
    "poNumber" TEXT,
    "pickupNumber" TEXT,
    "trackingNumber" TEXT,
    "proNumber" TEXT,
    "htPallet" BOOLEAN NOT NULL DEFAULT false,
    "palletType" TEXT,
    "dangerousGood" TEXT,
    "sealedDrum" TEXT,
    "notes" TEXT,
    "guiaId" TEXT,
    "pickupRequestId" TEXT,

    CONSTRAINT "WarehouseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "packageType" TEXT,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "location" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "pcTracking" TEXT,

    CONSTRAINT "WarehouseReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PickupRequest_seq_key" ON "PickupRequest"("seq");

-- CreateIndex
CREATE INDEX "PickupRequest_guiaId_idx" ON "PickupRequest"("guiaId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseReceipt_seq_key" ON "WarehouseReceipt"("seq");

-- CreateIndex
CREATE INDEX "WarehouseReceipt_guiaId_idx" ON "WarehouseReceipt"("guiaId");

-- CreateIndex
CREATE INDEX "WarehouseReceipt_pickupRequestId_idx" ON "WarehouseReceipt"("pickupRequestId");

-- CreateIndex
CREATE INDEX "WarehouseReceiptLine_receiptId_idx" ON "WarehouseReceiptLine"("receiptId");

-- AddForeignKey
ALTER TABLE "PickupRequest" ADD CONSTRAINT "PickupRequest_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "AirWaybillDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseReceipt" ADD CONSTRAINT "WarehouseReceipt_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "AirWaybillDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseReceipt" ADD CONSTRAINT "WarehouseReceipt_pickupRequestId_fkey" FOREIGN KEY ("pickupRequestId") REFERENCES "PickupRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseReceiptLine" ADD CONSTRAINT "WarehouseReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "WarehouseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Warehouse receipts continue the K numbers of the reference receipt (K5499), so the first one here is K5500.
SELECT setval(pg_get_serial_sequence('"WarehouseReceipt"', 'seq'), 5499);
