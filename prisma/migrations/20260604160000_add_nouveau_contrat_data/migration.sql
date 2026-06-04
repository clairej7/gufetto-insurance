-- AlterTable
ALTER TABLE "InsurancePipeline" ADD COLUMN "nouveauNumeroContrat" TEXT,
                                ADD COLUMN "nouveauDateEffet"     TIMESTAMP(3),
                                ADD COLUMN "nouveauPrimeTTC"      DOUBLE PRECISION;
