CREATE TABLE "DevisRecu" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "assureur" TEXT NOT NULL,
    "numeroContrat" TEXT,
    "primeTTC" DOUBLE PRECISION NOT NULL,
    "data" TEXT,
    "notes" TEXT,
    "pdfName" TEXT,
    "recommande" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DevisRecu_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "DevisRecu" ADD CONSTRAINT "DevisRecu_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "InsurancePipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
