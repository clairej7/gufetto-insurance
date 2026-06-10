import { prisma } from "@/lib/prisma";
import { PipelineStatut } from "@/generated/prisma/client";
import { TERMINAL_STATUTS } from "@/lib/pipeline";

// Forme normalisée d'une copro entrante, commune aux deux voies de sync
// (API Omni live et push JSON manuel).
export type SyncCoproInput = {
  buildingId: string;
  nom: string;
  adresse?: string | null;
  gestionnaireEmail?: string | null;
  assureurActuel?: string | null;
  numeroContrat?: string | null;
  courtierActuel?: string | null;
  primeActuelle?: number | null;
  dateEcheance?: Date | null;
  dateDebutContrat?: Date | null;
  contactCsEmail?: string | null;
  contactCsNom?: string | null;
  contactCourtierEmail?: string | null;
  contactCourtierTel?: string | null;
  // Statut de vente brut côté Omni. `undefined`/`null` = Omni n'apporte pas de
  // statut → on ne touche JAMAIS au statut d'un pipeline existant.
  salesStatus?: string | null;
};

// Mappe le "Insurance Sales Status" d'Omni vers un PipelineStatut.
export function mapSalesStatus(status: string | null | undefined): PipelineStatut {
  if (!status) return "identifie";
  const s = status.toLowerCase().trim();
  if (s === "no action") return "identifie";
  if (s === "waiting claims history") return "rs_en_cours";
  if (s === "quote asked") return "devis_demandes";
  if (s === "quote received") return "devis_recus";
  if (s === "quote validated") return "envoye_cs";
  if (s === "contract signed") return "contrat_signe";
  if (s === "contract uploaded") return "resiliation_envoyee";
  if (s === "uninsurable") return "non_assurable";
  if (s === "refused") return "refuse";
  return "identifie";
}

const TERMINAL = TERMINAL_STATUTS as PipelineStatut[];

export type SyncResult = {
  created: number;
  updated: number;
  pipelinesCreated: number;
  statutsUpdatedFromOmni: number;
  statutsKeptCrm: number;
  archived: number;
  total: number;
  errors?: string[];
};

export type SyncOptions = {
  // N'activer QUE si `records` représente l'inventaire COMPLET des copros gérées.
  // Avec une requête Omni filtrée (ex. échéance < 8 mois), l'absence d'une copro
  // ne signifie PAS qu'elle est perdue → archiver serait destructeur. Défaut: false.
  archiveAbsent?: boolean;
};

/**
 * Fusionne une liste de copros entrantes avec la base, selon le modèle
 * "Omni = faits immeuble, CRM = workflow" :
 *
 * - Faits immeuble (nom, adresse, gestionnaire, assureur, échéance…) : toujours rafraîchis.
 * - Statut du pipeline : Omni ne l'écrit QUE si (a) un statut Omni est fourni,
 *   (b) le pipeline n'a jamais été touché par un humain (cliquet permanent),
 *   et (c) le statut n'est pas terminal (verrou en dur).
 * - Tâches / événements / complétions / devis : jamais touchés.
 *
 * "Touché" = il existe un PipelineEvent créé par un humain (createdBy contient "@")
 * hors type `sync_auto`. Dérivé des événements → aucune instrumentation des actions.
 */
export async function syncCopros(
  records: SyncCoproInput[],
  options: SyncOptions = {}
): Promise<SyncResult> {
  // Ensemble des pipelines déjà touchés par un humain (cliquet permanent).
  const touchedRows = await prisma.pipelineEvent.findMany({
    where: { createdBy: { contains: "@" }, NOT: { type: "sync_auto" } },
    select: { pipelineId: true },
    distinct: ["pipelineId"],
  });
  const touched = new Set(touchedRows.map((r) => r.pipelineId));

  let created = 0;
  let updated = 0;
  let pipelinesCreated = 0;
  let statutsUpdatedFromOmni = 0;
  let statutsKeptCrm = 0;
  const errors: string[] = [];
  const seenBuildingIds: string[] = [];

  for (const rec of records) {
    try {
      if (!rec.buildingId) {
        errors.push("Entrée sans building ID ignorée");
        continue;
      }
      seenBuildingIds.push(rec.buildingId);

      const echeance = rec.dateEcheance ?? null;
      const facts = {
        nom: rec.nom || rec.buildingId,
        adresse: rec.adresse ?? null,
        gestionnaireEmail: rec.gestionnaireEmail ?? null,
        assureurActuel: rec.assureurActuel ?? null,
        numeroContrat: rec.numeroContrat ?? null,
        courtierActuel: rec.courtierActuel ?? null,
        primeActuelle: rec.primeActuelle ?? null,
        dateEcheance: echeance,
        dateDebutContrat: rec.dateDebutContrat ?? null,
        contactCsEmail: rec.contactCsEmail ?? null,
        contactCsNom: rec.contactCsNom ?? null,
        contactCourtierEmail: rec.contactCourtierEmail ?? null,
        contactCourtierTel: rec.contactCourtierTel ?? null,
        source: "omni" as const,
        syncedAt: new Date(),
        archivedAt: null, // réapparue dans la sync → désarchiver
      };

      const hasStatut = rec.salesStatus != null && rec.salesStatus !== "";
      const omniStatut = mapSalesStatus(rec.salesStatus);
      const anneeEcheance = echeance ? echeance.getFullYear() : new Date().getFullYear();

      const existing = await prisma.copro.findUnique({
        where: { buildingId: rec.buildingId },
        include: { pipelines: true },
      });

      if (!existing) {
        const newCopro = await prisma.copro.create({
          data: { buildingId: rec.buildingId, ...facts },
        });
        // Nouvel immeuble : jamais touché → on pose le statut Omni mappé (ou identifie).
        await prisma.insurancePipeline.create({
          data: { coproId: newCopro.id, statut: omniStatut, anneeEcheance },
        });
        pipelinesCreated++;
        created++;
      } else {
        await prisma.copro.update({ where: { buildingId: rec.buildingId }, data: facts });

        if (existing.pipelines.length === 0) {
          await prisma.insurancePipeline.create({
            data: { coproId: existing.id, statut: omniStatut, anneeEcheance },
          });
          pipelinesCreated++;
        } else {
          for (const p of existing.pipelines) {
            // Rafraîchir l'année d'échéance (fait immeuble) sans toucher au statut.
            if (echeance && p.anneeEcheance !== anneeEcheance) {
              await prisma.insurancePipeline.update({
                where: { id: p.id },
                data: { anneeEcheance },
              });
            }

            // Règle statut : seulement si Omni fournit un statut.
            if (!hasStatut) {
              statutsKeptCrm++;
              continue;
            }
            // Verrou en dur : statut terminal CRM jamais écrasé.
            if (TERMINAL.includes(p.statut)) {
              statutsKeptCrm++;
              continue;
            }
            // Cliquet permanent : touché par un humain → CRM garde.
            if (touched.has(p.id)) {
              statutsKeptCrm++;
              continue;
            }
            // Sinon Omni met à jour si différent (et trace en sync_auto, exclu du test "touché").
            if (p.statut !== omniStatut) {
              await prisma.insurancePipeline.update({
                where: { id: p.id },
                data: { statut: omniStatut },
              });
              await prisma.pipelineEvent.create({
                data: {
                  pipelineId: p.id,
                  type: "sync_auto",
                  ancienStatut: p.statut,
                  nouveauStatut: omniStatut,
                  description: `Statut mis à jour depuis Omni : "${p.statut}" → "${omniStatut}"`,
                  createdBy: "sync",
                },
              });
              statutsUpdatedFromOmni++;
            } else {
              statutsKeptCrm++;
            }
          }
        }
        updated++;
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // Archivage des copros absentes — UNIQUEMENT si l'appelant garantit un inventaire complet.
  let archived = 0;
  if (options.archiveAbsent && seenBuildingIds.length > 0) {
    const res = await prisma.copro.updateMany({
      where: {
        source: "omni",
        archivedAt: null,
        buildingId: { notIn: seenBuildingIds },
      },
      data: { archivedAt: new Date() },
    });
    archived = res.count;
  }

  return {
    created,
    updated,
    pipelinesCreated,
    statutsUpdatedFromOmni,
    statutsKeptCrm,
    archived,
    total: records.length,
    errors: errors.length ? errors : undefined,
  };
}
