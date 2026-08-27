import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/exclusions { kind: "gestionnaire"|"copro", value, label? } — ajoute.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { kind, value, label } = await req.json().catch(() => ({}));
  if (!["gestionnaire", "copro"].includes(kind) || !value?.trim()) return NextResponse.json({ error: "kind (gestionnaire|copro) et value requis" }, { status: 400 });
  const v = kind === "gestionnaire" ? String(value).toLowerCase().trim() : String(value).trim();
  await prisma.automationExclusion.upsert({
    where: { kind_value: { kind, value: v } },
    create: { kind, value: v, label: label?.trim() || v, createdBy: session.user.email! },
    update: { label: label?.trim() || v },
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/exclusions { id } OU { kind, value } — retire une exclusion.
// La variante kind+value sert au bouton « Remettre dans les automatisations »
// des fiches (on ne connaît que le coproId, pas l'id de la ligne d'exclusion).
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const { id, kind, value } = await req.json().catch(() => ({}));
  if (id) {
    await prisma.automationExclusion.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }
  if (["gestionnaire", "copro"].includes(kind) && value?.trim()) {
    const v = kind === "gestionnaire" ? String(value).toLowerCase().trim() : String(value).trim();
    await prisma.automationExclusion.deleteMany({ where: { kind, value: v } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "id, ou (kind + value), requis" }, { status: 400 });
}
