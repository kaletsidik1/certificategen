ALTER TABLE "Certificate"
ADD COLUMN "batchId" TEXT,
ADD COLUMN "rowIndex" INTEGER,
ADD COLUMN "programName" TEXT,
ADD COLUMN "emailSendingAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Certificate_batchId_rowIndex_key"
ON "Certificate"("batchId", "rowIndex");
