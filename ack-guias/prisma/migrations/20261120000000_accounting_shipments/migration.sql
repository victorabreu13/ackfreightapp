-- CreateTable
CREATE TABLE "AcctShipment" (
    "id" TEXT NOT NULL,
    "legacyId" TEXT,
    "guiaId" TEXT,
    "date" DATE NOT NULL,
    "client" TEXT NOT NULL,
    "awb" TEXT NOT NULL,
    "awb2" TEXT,
    "airline" TEXT NOT NULL,
    "dest" TEXT NOT NULL,
    "uldText" TEXT,
    "pcs" INTEGER NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cargoValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "clientPaid" BOOLEAN NOT NULL DEFAULT false,
    "clientPaidDate" DATE,
    "costRate" DOUBLE PRECISION,
    "sellRate" DOUBLE PRECISION,
    "airCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "airSold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickupCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pickupSold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "handlingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bupHandlingCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "handlingSold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferSold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kopeHandling" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kopeInCost" BOOLEAN NOT NULL DEFAULT false,
    "insuranceCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insuranceSold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "awbFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoicedOverride" DOUBLE PRECISION,
    "costTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiced" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "source" TEXT,
    "manualFields" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcctSplit" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" DATE,

    CONSTRAINT "AcctSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcctShipment_legacyId_key" ON "AcctShipment"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "AcctShipment_guiaId_key" ON "AcctShipment"("guiaId");

-- CreateIndex
CREATE INDEX "AcctShipment_date_idx" ON "AcctShipment"("date");

-- CreateIndex
CREATE INDEX "AcctShipment_client_idx" ON "AcctShipment"("client");

-- CreateIndex
CREATE INDEX "AcctShipment_awb_idx" ON "AcctShipment"("awb");

-- CreateIndex
CREATE INDEX "AcctSplit_shipmentId_idx" ON "AcctSplit"("shipmentId");

-- CreateIndex
CREATE INDEX "AcctSplit_payee_idx" ON "AcctSplit"("payee");

-- AddForeignKey
ALTER TABLE "AcctSplit" ADD CONSTRAINT "AcctSplit_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "AcctShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

