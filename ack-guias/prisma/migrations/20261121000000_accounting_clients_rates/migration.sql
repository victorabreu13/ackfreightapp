-- AlterTable
ALTER TABLE "AcctUldCost" DROP COLUMN "bupHandlingCost";

-- AlterTable
-- BUP handling is no longer a cost of its own: what the shipments already loaded carry for it joins their handling, so their totals do not change.
UPDATE "AcctShipment" SET "handlingCost" = "handlingCost" + "bupHandlingCost";
ALTER TABLE "AcctShipment" DROP COLUMN "bupHandlingCost";

-- CreateTable
CREATE TABLE "AcctClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "guiaClientId" TEXT,
    "kopeHandlingPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "kopeInCost" BOOLEAN NOT NULL DEFAULT true,
    "pickupPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "handlingPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferPerKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chargeBasis" TEXT NOT NULL DEFAULT 'chw',
    "insuranceCostPct" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "insuranceSoldPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "awbFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flatSellPerKg" DOUBLE PRECISION,
    "pickupProvider" TEXT,
    "transferProvider" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcctClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcctClientSplit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AcctClientSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcctClient_name_key" ON "AcctClient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AcctClient_guiaClientId_key" ON "AcctClient"("guiaClientId");

-- CreateIndex
CREATE INDEX "AcctClientSplit_clientId_idx" ON "AcctClientSplit"("clientId");

-- AddForeignKey
ALTER TABLE "AcctClientSplit" ADD CONSTRAINT "AcctClientSplit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "AcctClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The clients of the accounting: how each is charged and its default split of the profit.
INSERT INTO "AcctClient" ("id","name","kopeHandlingPct","kopeInCost","pickupPerKg","handlingPerKg","transferPerKg","chargeBasis","insuranceCostPct","insuranceSoldPct","awbFee","flatSellPerKg","updatedAt") VALUES (md5('client:VENEX'),'VENEX',10,true,0,0,0,'chw',0.35,0.5,0,2.45,CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:VENEX:ack'),"id",'ACK',65 FROM "AcctClient" WHERE "name"='VENEX' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:VENEX:ack'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:VENEX:victor'),"id",'Victor',35 FROM "AcctClient" WHERE "name"='VENEX' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:VENEX:victor'));
INSERT INTO "AcctClient" ("id","name","kopeHandlingPct","kopeInCost","pickupPerKg","handlingPerKg","transferPerKg","chargeBasis","insuranceCostPct","insuranceSoldPct","awbFee","flatSellPerKg","updatedAt") VALUES (md5('client:JUSTINE'),'JUSTINE',10,true,0.1,0.1,0.1,'chw',0,0,45,NULL,CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:JUSTINE:ack'),"id",'ACK',50 FROM "AcctClient" WHERE "name"='JUSTINE' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:JUSTINE:ack'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:JUSTINE:justy'),"id",'Justy',25 FROM "AcctClient" WHERE "name"='JUSTINE' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:JUSTINE:justy'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:JUSTINE:andres'),"id",'Andres',25 FROM "AcctClient" WHERE "name"='JUSTINE' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:JUSTINE:andres'));
INSERT INTO "AcctClient" ("id","name","kopeHandlingPct","kopeInCost","pickupPerKg","handlingPerKg","transferPerKg","chargeBasis","insuranceCostPct","insuranceSoldPct","awbFee","flatSellPerKg","updatedAt") VALUES (md5('client:PACIFIKO'),'PACIFIKO',10,true,0.15,0.2,0.15,'gross',0.35,0.5,50,NULL,CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:PACIFIKO:ack'),"id",'ACK',55 FROM "AcctClient" WHERE "name"='PACIFIKO' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:PACIFIKO:ack'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:PACIFIKO:victor'),"id",'Victor',35 FROM "AcctClient" WHERE "name"='PACIFIKO' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:PACIFIKO:victor'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:PACIFIKO:pamela'),"id",'Pamela',10 FROM "AcctClient" WHERE "name"='PACIFIKO' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:PACIFIKO:pamela'));
INSERT INTO "AcctClient" ("id","name","kopeHandlingPct","kopeInCost","pickupPerKg","handlingPerKg","transferPerKg","chargeBasis","insuranceCostPct","insuranceSoldPct","awbFee","flatSellPerKg","updatedAt") VALUES (md5('client:GREYMAR'),'GREYMAR',10,true,0,0,0,'chw',0.35,0.5,0,2.45,CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:GREYMAR:ack'),"id",'ACK',65 FROM "AcctClient" WHERE "name"='GREYMAR' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:GREYMAR:ack'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:GREYMAR:victor'),"id",'Victor',35 FROM "AcctClient" WHERE "name"='GREYMAR' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:GREYMAR:victor'));
INSERT INTO "AcctClient" ("id","name","kopeHandlingPct","kopeInCost","pickupPerKg","handlingPerKg","transferPerKg","chargeBasis","insuranceCostPct","insuranceSoldPct","awbFee","flatSellPerKg","updatedAt") VALUES (md5('client:SUINCA'),'SUINCA',10,true,0,0,0,'chw',0.35,0.5,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:SUINCA:ack'),"id",'ACK',65 FROM "AcctClient" WHERE "name"='SUINCA' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:SUINCA:ack'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:SUINCA:victor'),"id",'Victor',35 FROM "AcctClient" WHERE "name"='SUINCA' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:SUINCA:victor'));
INSERT INTO "AcctClient" ("id","name","kopeHandlingPct","kopeInCost","pickupPerKg","handlingPerKg","transferPerKg","chargeBasis","insuranceCostPct","insuranceSoldPct","awbFee","flatSellPerKg","updatedAt") VALUES (md5('client:CCS RSO'),'CCS RSO',10,true,0,0,0,'chw',0.35,0.5,0,NULL,CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:CCS RSO:ack'),"id",'ACK',65 FROM "AcctClient" WHERE "name"='CCS RSO' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:CCS RSO:ack'));
INSERT INTO "AcctClientSplit" ("id","clientId","payee","pct") SELECT md5('split:CCS RSO:victor'),"id",'Victor',35 FROM "AcctClient" WHERE "name"='CCS RSO' AND NOT EXISTS (SELECT 1 FROM "AcctClientSplit" x WHERE x."id"=md5('split:CCS RSO:victor'));

-- The rate tables of the Sheet, each from the first day of its month.
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-03-01:AA:MVD'),'AA','MVD','2026-03-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:AAEXP:MVD'),'AAEXP','MVD','2026-03-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:LATAM:MVD'),'LATAM','MVD','2026-03-01',3.1,2.8,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:AVI:MVD'),'AVI','MVD','2026-03-01',3.1,2.7,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:ATL:UIO'),'ATL','UIO','2026-03-01',0.75,0.55,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:LATAM:UIO'),'LATAM','UIO','2026-03-01',0.75,0.5,6,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:LATAM:GUA'),'LATAM','GUA','2026-03-01',1.3,0.9,7,CURRENT_TIMESTAMP),
  (md5('rate:2026-03-01:LATAM:CCS'),'LATAM','CCS','2026-03-01',2.3,2,8,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-10-01:AA:MVD'),'AA','MVD','2026-10-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:AAEXP:MVD'),'AAEXP','MVD','2026-10-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:LATAM:SJO'),'LATAM','SJO','2026-10-01',1.58,1.04,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:AVI:SJO'),'AVI','SJO','2026-10-01',1.58,1.25,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:AVI:GUA'),'AVI','GUA','2026-10-01',1.58,1.25,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:ATL:UIO'),'ATL','UIO','2026-10-01',0.75,0.55,6,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:LATAM:UIO'),'LATAM','UIO','2026-10-01',0.75,0.5,7,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:LATAM:GUA'),'LATAM','GUA','2026-10-01',1.58,1.16,8,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:LATAM:VLN'),'LATAM','VLN','2026-10-01',2.4,2,9,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:LATAM:CCS'),'LATAM','CCS','2026-10-01',2.45,2,10,CURRENT_TIMESTAMP),
  (md5('rate:2026-10-01:AJT:GUA'),'AJT','GUA','2026-10-01',1.7,1.4,11,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-08-01:AA:MVD'),'AA','MVD','2026-08-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:AAEXP:MVD'),'AAEXP','MVD','2026-08-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:LATAM:SJO'),'LATAM','SJO','2026-08-01',1.5,0.9,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:AVI:SJO'),'AVI','SJO','2026-08-01',1.5,0.9,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:AVI:GUA'),'AVI','GUA','2026-08-01',1.5,0.9,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:ATL:UIO'),'ATL','UIO','2026-08-01',0.75,0.55,6,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:LATAM:UIO'),'LATAM','UIO','2026-08-01',0.75,0.5,7,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:LATAM:GUA'),'LATAM','GUA','2026-08-01',1.5,1,8,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:LATAM:VLN'),'LATAM','VLN','2026-08-01',2.4,2,9,CURRENT_TIMESTAMP),
  (md5('rate:2026-08-01:LATAM:CCS'),'LATAM','CCS','2026-08-01',2.3,2,10,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-09-01:AA:MVD'),'AA','MVD','2026-09-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:AAEXP:MVD'),'AAEXP','MVD','2026-09-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:LATAM:SJO'),'LATAM','SJO','2026-09-01',1.5,1.04,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:AVI:SJO'),'AVI','SJO','2026-09-01',1.5,1.1,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:AVI:GUA'),'AVI','GUA','2026-09-01',1.5,1.1,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:ATL:UIO'),'ATL','UIO','2026-09-01',0.75,0.55,6,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:LATAM:UIO'),'LATAM','UIO','2026-09-01',0.75,0.5,7,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:LATAM:GUA'),'LATAM','GUA','2026-09-01',1.5,1.04,8,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:LATAM:VLN'),'LATAM','VLN','2026-09-01',2.4,2,9,CURRENT_TIMESTAMP),
  (md5('rate:2026-09-01:LATAM:CCS'),'LATAM','CCS','2026-09-01',0,2,10,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-06-01:AA:MVD'),'AA','MVD','2026-06-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:AAEXP:MVD'),'AAEXP','MVD','2026-06-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:LATAM:SJO'),'LATAM','SJO','2026-06-01',1.5,0.9,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:AVI:SJO'),'AVI','SJO','2026-06-01',1.5,0.9,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:AVI:GUA'),'AVI','GUA','2026-06-01',1.5,0.9,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:ATL:UIO'),'ATL','UIO','2026-06-01',0.75,0.55,6,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:LATAM:UIO'),'LATAM','UIO','2026-06-01',0.75,0.5,7,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:LATAM:GUA'),'LATAM','GUA','2026-06-01',1.5,0.9,8,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:LATAM:VLN'),'LATAM','VLN','2026-06-01',2.4,2,9,CURRENT_TIMESTAMP),
  (md5('rate:2026-06-01:LATAM:CCS'),'LATAM','CCS','2026-06-01',2.3,2,10,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-05-01:AA:MVD'),'AA','MVD','2026-05-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:AAEXP:MVD'),'AAEXP','MVD','2026-05-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:AVI:SJO'),'AVI','SJO','2026-05-01',1.5,0.9,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:AVI:GUA'),'AVI','GUA','2026-05-01',1.5,0.9,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:ATL:UIO'),'ATL','UIO','2026-05-01',0.75,0.55,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:LATAM:UIO'),'LATAM','UIO','2026-05-01',0.75,0.5,6,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:LATAM:GUA'),'LATAM','GUA','2026-05-01',1.5,1,7,CURRENT_TIMESTAMP),
  (md5('rate:2026-05-01:LATAM:CCS'),'LATAM','CCS','2026-05-01',2.3,2,8,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt") VALUES
  (md5('rate:2026-01-01:AA:MVD'),'AA','MVD','2026-01-01',3,2.38,1,CURRENT_TIMESTAMP),
  (md5('rate:2026-01-01:AAEXP:MVD'),'AAEXP','MVD','2026-01-01',3,2.7,2,CURRENT_TIMESTAMP),
  (md5('rate:2026-01-01:LATAM:MVD'),'LATAM','MVD','2026-01-01',3.1,2.8,3,CURRENT_TIMESTAMP),
  (md5('rate:2026-01-01:AVI:MVD'),'AVI','MVD','2026-01-01',3.1,2.7,4,CURRENT_TIMESTAMP),
  (md5('rate:2026-01-01:ATL:UIO'),'ATL','UIO','2026-01-01',0.75,0.55,5,CURRENT_TIMESTAMP),
  (md5('rate:2026-01-01:LATAM:UIO'),'LATAM','UIO','2026-01-01',0.75,0.5,6,CURRENT_TIMESTAMP)
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;

-- The November table has the sell rates ACK gave. Its costs, and the lanes it does not list, come from the October table.
UPDATE "AirlineRate" n SET "buyRate" = o."buyRate"
FROM "AirlineRate" o
WHERE n."effectiveFrom" = DATE '2026-11-01' AND o."effectiveFrom" = DATE '2026-10-01'
  AND n."airline" = o."airline" AND n."destination" = o."destination" AND n."buyRate" IS NULL;
INSERT INTO "AirlineRate" ("id","airline","destination","effectiveFrom","sellRate","buyRate","sortOrder","updatedAt")
SELECT md5('rate:2026-11-01:' || o."airline" || ':' || o."destination"), o."airline", o."destination", DATE '2026-11-01', o."sellRate", o."buyRate", o."sortOrder" + 100, CURRENT_TIMESTAMP
FROM "AirlineRate" o
WHERE o."effectiveFrom" = DATE '2026-10-01'
  AND NOT EXISTS (SELECT 1 FROM "AirlineRate" n WHERE n."effectiveFrom" = DATE '2026-11-01' AND n."airline" = o."airline" AND n."destination" = o."destination")
ON CONFLICT ("airline","destination","effectiveFrom") DO NOTHING;
