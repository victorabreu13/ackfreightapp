-- AlterTable
ALTER TABLE "AcctClient" ADD COLUMN     "billToAddress" TEXT,
ADD COLUMN     "billToName" TEXT,
ADD COLUMN     "billingEmails" TEXT;

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "id" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "shipmentId" TEXT,
    "guiaId" TEXT,
    "guiaClientId" TEXT,
    "client" TEXT NOT NULL,
    "billToName" TEXT NOT NULL,
    "billToAddress" TEXT,
    "emails" TEXT,
    "awb" TEXT,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "terms" TEXT NOT NULL DEFAULT 'Due on receipt',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "sentTo" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "serviceDate" DATE,
    "product" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_shipmentId_key" ON "Invoice"("shipmentId");

-- CreateIndex
CREATE INDEX "Invoice_guiaClientId_status_idx" ON "Invoice"("guiaClientId", "status");

-- CreateIndex
CREATE INDEX "Invoice_status_invoiceDate_idx" ON "Invoice"("status", "invoiceDate");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The first invoice of ACK Guías is number 3000.
INSERT INTO "InvoiceCounter" ("id", "lastNumber") VALUES ('invoice', 2999);

-- Billing data of the client of the example invoice.
UPDATE "AcctClient" SET "billToName" = 'PACIFIKO LLC', "billToAddress" = '8504 NW 70 ST' || E'\n' || 'Doral FL 33166' WHERE "name" = 'PACIFIKO';
