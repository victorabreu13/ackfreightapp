-- CreateTable
CREATE TABLE "GuiaParty" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "guiaClientId" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaParty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuiaParty_agentKey_role_normalizedName_idx" ON "GuiaParty"("agentKey", "role", "normalizedName");

-- CreateIndex
CREATE INDEX "GuiaParty_guiaClientId_idx" ON "GuiaParty"("guiaClientId");

-- CreateIndex
CREATE UNIQUE INDEX "GuiaParty_agentKey_guiaClientId_role_normalizedName_key" ON "GuiaParty"("agentKey", "guiaClientId", "role", "normalizedName");

-- AddForeignKey
ALTER TABLE "GuiaParty" ADD CONSTRAINT "GuiaParty_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "IssuingAgent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuiaParty" ADD CONSTRAINT "GuiaParty_guiaClientId_fkey" FOREIGN KEY ("guiaClientId") REFERENCES "GuiaClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

