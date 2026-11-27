-- CreateTable
CREATE TABLE "AirlineRate" (
    "id" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "sellRate" DOUBLE PRECISION,
    "buyRate" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AirlineRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AirlineRate_airline_idx" ON "AirlineRate"("airline");

-- CreateIndex
CREATE UNIQUE INDEX "AirlineRate_airline_destination_key" ON "AirlineRate"("airline", "destination");


-- The sell rates ACK starts with, per kilo, to each destination, for the three airlines. The buy rates are filled in later.
INSERT INTO "AirlineRate" ("id", "airline", "destination", "sellRate", "sortOrder", "updatedAt")
SELECT md5(a.airline || ':' || v.destination), a.airline, v.destination, v.rate::double precision, v.ord, CURRENT_TIMESTAMP
FROM (VALUES ('LATAM'), ('Avianca'), ('Amerijet')) AS a(airline)
CROSS JOIN (VALUES
  ('SJO', 1.55, 1), ('GUA', 1.55, 2), ('PTY', 1.55, 3), ('SAL', 1.65, 4), ('SAP', 1.65, 5), ('MAO', 2.20, 6),
  ('GRU', 3.10, 7), ('VCP', 3.50, 8), ('SCL', 3.50, 9), ('EZE', 3.80, 10), ('MGA', 1.85, 11), ('LIM', 1.90, 12),
  ('BOG', 1.20, 13), ('MDE', 1.10, 14), ('UIO', 1.10, 15), ('GYE', 1.60, 16)
) AS v(destination, rate, ord)
ON CONFLICT ("airline", "destination") DO NOTHING;
