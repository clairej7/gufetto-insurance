import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("path");

  if (!path) {
    return NextResponse.json({ error: "path requis" }, { status: 400 });
  }

  const { data: fileData, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .download(path);

  if (error || !fileData) {
    return NextResponse.json(
      { error: `Téléchargement échoué: ${error?.message}` },
      { status: 500 }
    );
  }

  const contentType = path.endsWith(".pdf") ? "application/pdf" : "application/octet-stream";

  return new NextResponse(fileData, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${path.split("/").pop()}"`,
    },
  });
}
