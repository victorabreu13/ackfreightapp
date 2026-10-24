-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CUSTOMER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "guiaClientId" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "AirWaybillDocument" ADD COLUMN     "flightCheckedAt" TIMESTAMP(3),
ADD COLUMN     "flightStatus" TEXT,
ADD COLUMN     "flightStatusDetail" TEXT;

-- CreateTable
CREATE TABLE "CustomerInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT,
    "email" TEXT NOT NULL,
    "guiaClientId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuiaFlightEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "emailedTo" TEXT,
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuiaFlightEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInvite_tokenHash_key" ON "CustomerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerInvite_guiaClientId_idx" ON "CustomerInvite"("guiaClientId");

-- CreateIndex
CREATE INDEX "CustomerInvite_email_idx" ON "CustomerInvite"("email");

-- CreateIndex
CREATE INDEX "GuiaFlightEvent_documentId_createdAt_idx" ON "GuiaFlightEvent"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "User_guiaClientId_idx" ON "User"("guiaClientId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_guiaClientId_fkey" FOREIGN KEY ("guiaClientId") REFERENCES "GuiaClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInvite" ADD CONSTRAINT "CustomerInvite_guiaClientId_fkey" FOREIGN KEY ("guiaClientId") REFERENCES "GuiaClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaFlightEvent" ADD CONSTRAINT "GuiaFlightEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AirWaybillDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

