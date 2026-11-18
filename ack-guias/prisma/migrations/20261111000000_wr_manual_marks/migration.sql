-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "chargeableManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grossManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "piecesManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wrDismissed" TEXT;

-- CreateTable
CREATE TABLE "GuiaChangeLog" (
    "id" TEXT NOT NULL,
    "guiaId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "source" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuiaChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuiaChangeLog_guiaId_createdAt_idx" ON "GuiaChangeLog"("guiaId", "createdAt");

-- AddForeignKey
ALTER TABLE "GuiaChangeLog" ADD CONSTRAINT "GuiaChangeLog_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "AirWaybillDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

