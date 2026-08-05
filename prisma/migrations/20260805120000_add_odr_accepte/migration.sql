-- Ajoute la valeur "odr_accepte" (2e étape ODR : ordre accepté par l'assureur,
-- deal gagné mais mandat pas encore actif) juste après "odr_en_cours".
ALTER TYPE "PipelineStatut" ADD VALUE IF NOT EXISTS 'odr_accepte' AFTER 'odr_en_cours';
