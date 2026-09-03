import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendDevis6Relances } from "@/lib/devis6-relance";
import { isAppFlagOn } from "@/lib/exclusions";

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cron/devis6-relances
// Relance en thread les gestionnaires sans réponse depuis ≥ 24 h (auto 6).
// Auth : Bearer CRON_SECRET (cron interne) OU session admin (bouton manuel).
//
// GARDE-FOU ANTI-ENVOI EN MASSE :
//  • Appel CRON (Bearer) → n'ENVOIE QUE si env DEVIS6_RELANCE_ENABLED === "true",
//    sinon dry-run (compte les éligibles, n'envoie rien). Permet de valider à la
//    main avant d'activer l'auto.
//  • Appel ADMIN (bouton) → ?dryRun=1 pour compter, ?limit=N pour n'envoyer que N
//    dossiers (test avec 1), sinon envoie tous les éligibles.
export async function POST(req: NextRequest) {
  const authz = req.headers.get("authorization");
  const isCron = !!CRON_SECRET && authz === `Bearer ${CRON_SECRET}`;
  const session = isCron ? null : await auth();
  if (!isCron && !session?.user?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const by = isCron ? "auto:devis6-relance" : (session?.user?.email ?? "admin");
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(0, parseInt(limitParam, 10)) : undefined;
  const dryRunParam = url.searchParams.get("dryRun") === "1";
  const hoursParam = url.searchParams.get("hours");
  const hours = hoursParam ? Math.min(168, Math.max(1, parseInt(hoursParam, 10))) : undefined; // override de test admin (1..168 h)

  // Activation via TOGGLE EN BASE (isAppFlagOn) — PLUS d'env Railway (c'était la
  // cause du bug le 2026-09-03 : le cron tournait, mais l'app ne voyait pas
  // DEVIS6_RELANCE_ENABLED posée sur le mauvais service → dry-run permanent). La base
  // est vue de façon fiable par tous les services. Défaut = OFF (aucune ligne).
  const cronEnabled = await isAppFlagOn("devis6_relance_enabled");
  const opts = isCron
    ? { dryRun: !cronEnabled }               // cron : dry-run tant que non activé, seuil 48 h
    : { limit, dryRun: dryRunParam, hours };  // admin : test paramétrable (+ override d'heures)

  const r = await sendDevis6Relances(new Date(), by, opts);
  return NextResponse.json({ success: true, gated: isCron && !cronEnabled, ...r });
}
