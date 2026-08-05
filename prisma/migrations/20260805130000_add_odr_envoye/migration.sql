-- Ajoute "odr_envoye" (ODR envoyé à l'assureur, en attente de réponse — étape
-- ACTIVE) entre "odr_en_cours" et "odr_accepte".
ALTER TYPE "PipelineStatut" ADD VALUE IF NOT EXISTS 'odr_envoye' AFTER 'odr_en_cours';
