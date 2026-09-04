import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildOdrRecapMessage } from "@/lib/odr-suivi";

// GET /api/odr-suivi/preview (admin) — construit EXACTEMENT le message qui serait
// posté (même builder que l'envoi) mais ne poste rien. Sert à la prévisualisation
// avant le clic « Transmettre » : message + gestios taggés/non trouvés + lien réel
// vers la page gestio.
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Réservé aux admins" }, { status: 403 });
  const m = await buildOdrRecapMessage(new Date());
  return NextResponse.json({
    success: true,
    count: m.count,
    label: m.label,
    weekNum: m.weekNum,
    url: m.url,
    gestios: m.gestios,
  });
}
