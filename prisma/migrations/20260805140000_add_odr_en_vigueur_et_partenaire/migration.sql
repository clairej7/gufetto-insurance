-- ODR : nouvelle valeur "odr_en_vigueur" (ordre accepté ET en vigueur/récupéré,
-- deal gagné/clos) + marqueur persistant "odrPartenaire" sur le pipeline.
ALTER TYPE "PipelineStatut" ADD VALUE IF NOT EXISTS 'odr_en_vigueur' AFTER 'odr_accepte';
ALTER TABLE "InsurancePipeline" ADD COLUMN IF NOT EXISTS "odrPartenaire" TEXT;
