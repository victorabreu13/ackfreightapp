-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEAM', 'ACCOUNTING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "image" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'google',
    "accountingAgentKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirlinePrefix" (
    "prefix" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "iata" TEXT,
    "trackingUrlTemplate" TEXT,
    "parserType" TEXT NOT NULL DEFAULT 'none',
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirlinePrefix_pkey" PRIMARY KEY ("prefix")
);

-- CreateTable
CREATE TABLE "IssuingAgent" (
    "key" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT NOT NULL,
    "iataCode" TEXT NOT NULL,
    "accountNo" TEXT,
    "signatureLine" TEXT NOT NULL,
    "conditions" TEXT NOT NULL DEFAULT 'bilingual',
    "copyLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssuingAgent_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AirWaybillDocument" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "awb" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "shipperName" TEXT,
    "shipperAddress" TEXT,
    "shipperAccount" TEXT,
    "consigneeName" TEXT,
    "consigneeAddress" TEXT,
    "consigneeAccount" TEXT,
    "carrierName" TEXT,
    "carrierAddress" TEXT,
    "accountNo" TEXT,
    "referenceNumber" TEXT,
    "departure" TEXT,
    "to1" TEXT,
    "by1" TEXT,
    "to2" TEXT,
    "by2" TEXT,
    "to3" TEXT,
    "by3" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "chgsCode" TEXT NOT NULL DEFAULT 'PP',
    "wtVal" TEXT NOT NULL DEFAULT 'PPD',
    "otherPpc" TEXT NOT NULL DEFAULT 'PPD',
    "declaredCarriage" TEXT NOT NULL DEFAULT 'NVC',
    "declaredCustoms" TEXT NOT NULL DEFAULT 'NVD',
    "destination" TEXT,
    "flightDate" TEXT,
    "insurance" TEXT,
    "handling" TEXT,
    "aesItn" TEXT,
    "sci" TEXT,
    "destCountry" TEXT,
    "hawb" TEXT,
    "otherChargesText" TEXT,
    "accountingInfo" TEXT,
    "weightCharge" DOUBLE PRECISION,
    "valuationCharge" DOUBLE PRECISION DEFAULT 0,
    "taxCharge" DOUBLE PRECISION DEFAULT 0,
    "otherDueAgent" DOUBLE PRECISION DEFAULT 0,
    "otherDueCarrier" DOUBLE PRECISION DEFAULT 0,
    "shipperSignature" TEXT,
    "executedOn" TEXT,
    "executedAt" TEXT,
    "carrierSignature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "threadId" TEXT,
    "createdBy" TEXT,
    "product" TEXT NOT NULL DEFAULT 'guia',
    "guiaClientId" TEXT,
    "clientLabel" TEXT,
    "notifyName" TEXT,
    "notifyAddress" TEXT,
    "flightNumber" TEXT,
    "truckerName" TEXT,
    "truckerPhone" TEXT,
    "driverName" TEXT,
    "seal" TEXT,
    "reviewJson" TEXT,
    "snippetJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceAmount" DOUBLE PRECISION,
    "invoicedAt" TIMESTAMP(3),
    "invoicedBy" TEXT,
    "qboInvoiceId" TEXT,
    "qboDocNumber" TEXT,
    "qboRealmId" TEXT,
    "qboClaimedAt" TIMESTAMP(3),

    CONSTRAINT "AirWaybillDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "agentKey" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "letterheadName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "fax" TEXT,
    "opsEmail" TEXT,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "termsUrl" TEXT,
    "tsaIacId" TEXT,
    "ccsfId" TEXT,
    "warehouseName" TEXT,
    "warehouseAddress" TEXT,
    "signerName" TEXT NOT NULL,
    "signerTitle" TEXT,
    "logo" BYTEA,
    "logoMime" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("agentKey")
);

-- CreateTable
CREATE TABLE "GuiaDriveFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaDriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuiaDocument" (
    "id" TEXT NOT NULL,
    "guiaId" TEXT,
    "client" TEXT NOT NULL,
    "awb" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'generated',
    "mime" TEXT,
    "size" INTEGER,

    CONSTRAINT "GuiaDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwbGoodsLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pieces" INTEGER,
    "grossWeight" DOUBLE PRECISION,
    "kgLb" TEXT NOT NULL DEFAULT 'K',
    "rateClass" TEXT,
    "commodity" TEXT,
    "chargeableWeight" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "nature" TEXT,
    "length" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "dimUnit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AwbGoodsLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwbStockNumber" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "awb" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwbStockNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuiaClient" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientAgreedRate" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "guiaClientId" TEXT NOT NULL,
    "ratePerKg" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAgreedRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksConnection" (
    "agentKey" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "connectedBy" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksConnection_pkey" PRIMARY KEY ("agentKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AirWaybillDocument_awb_idx" ON "AirWaybillDocument"("awb");

-- CreateIndex
CREATE INDEX "AirWaybillDocument_agentKey_idx" ON "AirWaybillDocument"("agentKey");

-- CreateIndex
CREATE INDEX "AirWaybillDocument_status_idx" ON "AirWaybillDocument"("status");

-- CreateIndex
CREATE INDEX "AirWaybillDocument_product_idx" ON "AirWaybillDocument"("product");

-- CreateIndex
CREATE INDEX "AirWaybillDocument_guiaClientId_idx" ON "AirWaybillDocument"("guiaClientId");

-- CreateIndex
CREATE INDEX "GuiaDriveFile_documentId_idx" ON "GuiaDriveFile"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "GuiaDriveFile_documentId_kind_key" ON "GuiaDriveFile"("documentId", "kind");

-- CreateIndex
CREATE INDEX "GuiaDocument_client_idx" ON "GuiaDocument"("client");

-- CreateIndex
CREATE INDEX "GuiaDocument_awb_idx" ON "GuiaDocument"("awb");

-- CreateIndex
CREATE INDEX "GuiaDocument_kind_idx" ON "GuiaDocument"("kind");

-- CreateIndex
CREATE INDEX "GuiaDocument_company_idx" ON "GuiaDocument"("company");

-- CreateIndex
CREATE INDEX "GuiaDocument_generatedAt_idx" ON "GuiaDocument"("generatedAt");

-- CreateIndex
CREATE INDEX "GuiaDocument_guiaId_kind_idx" ON "GuiaDocument"("guiaId", "kind");

-- CreateIndex
CREATE INDEX "GuiaDocument_status_idx" ON "GuiaDocument"("status");

-- CreateIndex
CREATE INDEX "AwbGoodsLine_documentId_idx" ON "AwbGoodsLine"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "AwbStockNumber_awb_key" ON "AwbStockNumber"("awb");

-- CreateIndex
CREATE UNIQUE INDEX "AwbStockNumber_documentId_key" ON "AwbStockNumber"("documentId");

-- CreateIndex
CREATE INDEX "AwbStockNumber_prefix_agentKey_status_idx" ON "AwbStockNumber"("prefix", "agentKey", "status");

-- CreateIndex
CREATE INDEX "GuiaClient_agentKey_idx" ON "GuiaClient"("agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "GuiaClient_agentKey_normalizedName_key" ON "GuiaClient"("agentKey", "normalizedName");

-- CreateIndex
CREATE INDEX "ClientAgreedRate_agentKey_idx" ON "ClientAgreedRate"("agentKey");

-- CreateIndex
CREATE INDEX "ClientAgreedRate_guiaClientId_idx" ON "ClientAgreedRate"("guiaClientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAgreedRate_agentKey_guiaClientId_key" ON "ClientAgreedRate"("agentKey", "guiaClientId");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksConnection_realmId_key" ON "QuickBooksConnection"("realmId");

-- AddForeignKey
ALTER TABLE "AirWaybillDocument" ADD CONSTRAINT "AirWaybillDocument_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirWaybillDocument" ADD CONSTRAINT "AirWaybillDocument_guiaClientId_fkey" FOREIGN KEY ("guiaClientId") REFERENCES "GuiaClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaDriveFile" ADD CONSTRAINT "GuiaDriveFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AirWaybillDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaDocument" ADD CONSTRAINT "GuiaDocument_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "AirWaybillDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwbGoodsLine" ADD CONSTRAINT "AwbGoodsLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AirWaybillDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwbStockNumber" ADD CONSTRAINT "AwbStockNumber_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwbStockNumber" ADD CONSTRAINT "AwbStockNumber_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AirWaybillDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaClient" ADD CONSTRAINT "GuiaClient_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgreedRate" ADD CONSTRAINT "ClientAgreedRate_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientAgreedRate" ADD CONSTRAINT "ClientAgreedRate_guiaClientId_fkey" FOREIGN KEY ("guiaClientId") REFERENCES "GuiaClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksConnection" ADD CONSTRAINT "QuickBooksConnection_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- ACK TEAM LLC is the only issuer.
INSERT INTO "IssuingAgent" (
  "key", "legalName", "address", "phone", "city", "iataCode", "accountNo", "signatureLine", "conditions", "copyLabel", "updatedAt"
) VALUES (
  'ack',
  'ACK TEAM LLC',
  '6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES',
  NULL,
  'Doral',
  'SE1701005',
  'A2939-US-MIA-MIA',
  'ACK TEAM LLC AS AGENT FOR CARRIER',
  'bilingual',
  'Original 2 (for Consignee) - Pink',
  CURRENT_TIMESTAMP
);

INSERT INTO "CompanyProfile" (
  "agentKey", "brandName", "letterheadName", "address", "phone", "fax", "opsEmail",
  "contactName", "contactTitle", "termsUrl", "tsaIacId", "ccsfId", "warehouseName",
  "warehouseAddress", "signerName", "signerTitle", "logo", "logoMime", "updatedAt"
) VALUES (
  'ack',
  'ACK Freight',
  'ACK Logistics',
  '6550 NW 97TH AVE, SUITE 220, DORAL, FL 33178, UNITED STATES',
  '+1 (305) 915-3461',
  NULL,
  'andres.alvarado@ackfreight.com',
  'Andres Alvarado',
  'CEO & Operational Director',
  'https://www.ackfreight.com/',
  'SE2508006',
  NULL,
  NULL,
  NULL,
  'Victor Abreu',
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP
);

INSERT INTO "AirlinePrefix" ("prefix", "airline", "iata", "trackingUrlTemplate", "parserType", "notes", "updatedAt") VALUES
  ('045', 'LATAM', 'LA', 'https://www.latamcargo.com/en/trackshipment?docPrefix={prefix}&docNumber={serial}&soType=MAWB', 'latam', NULL, CURRENT_TIMESTAMP),
  ('810', 'Amerijet', 'M6', NULL, 'none', NULL, CURRENT_TIMESTAMP);


