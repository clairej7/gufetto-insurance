import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase";

export async function GET(req: NextRequest) {
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
