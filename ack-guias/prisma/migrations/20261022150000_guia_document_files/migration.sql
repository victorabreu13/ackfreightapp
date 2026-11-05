-- CreateTable
CREATE TABLE "GuiaDocumentFile" (
    "documentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuiaDocumentFile_pkey" PRIMARY KEY ("documentId")
);

-- AddForeignKey
ALTER TABLE "GuiaDocumentFile" ADD CONSTRAINT "GuiaDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GuiaDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

