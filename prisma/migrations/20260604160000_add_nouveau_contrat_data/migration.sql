ALTER TABLE "InsurancePipeline" ADD COLUMN IF NOT EXISTS "nouveauNumeroContrat" TEXT;
ALTER TABLE "InsurancePipeline" ADD COLUMN IF NOT EXISTS "nouveauDateEffet"     TIMESTAMP(3);
ALTER TABLE "InsurancePipeline" ADD COLUMN IF NOT EXISTS "nouveauPrimeTTC"      DOUBLE PRECISION;
