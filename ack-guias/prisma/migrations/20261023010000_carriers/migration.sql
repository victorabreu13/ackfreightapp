-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "carrierId" TEXT;

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "prefix" TEXT,
    "iata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Carrier_prefix_idx" ON "Carrier"("prefix");


-- The carriers the app already knew, so the list starts with what it printed before.
INSERT INTO "Carrier" ("id", "name", "address", "prefix", "iata", "updatedAt") VALUES
  ('carrier-045', 'LATAM AIRLINES CARGO (MIA)', E'1801 NW 66 AVENUE BLDG 709, MIAMI, FL 33122, UNITED STATES\nPhone: +1-786 265-6000', '045', 'LA', CURRENT_TIMESTAMP),
  ('carrier-369', 'ATLAS AIR', E'Worldwide Flight Services (WFS) 4350 NW 36TH ST POD C, MIAMI, FL 33166, UNITED STATES\nPhone: (305) 777-7295', '369', '5Y', CURRENT_TIMESTAMP),
  ('carrier-729', 'AVIANCA', '', '729', 'AV', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
