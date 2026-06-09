import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth-config";

// Middleware edge-compatible : pas de Prisma, juste vérification JWT
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!api/auth|api/webhooks|_next/static|_next/image|favicon.ico).*)"],
};
