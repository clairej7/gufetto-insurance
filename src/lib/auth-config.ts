import type { NextAuthConfig } from "next-auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());

// Config edge-compatible — SANS providers (le middleware vérifie uniquement le JWT)
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = (profile as { email?: string })?.email || "";
        return email.endsWith("@matera.eu");
      }
      return false;
    },
    async jwt({ token, user, profile }) {
      if (user) {
        token.isAdmin = ADMIN_EMAILS.includes(user.email || "");
      }
      if (profile) {
        token.email = (profile as { email?: string }).email ?? token.email;
        token.name  = (profile as { name?: string }).name  ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      const isPublic =
        path.startsWith("/api/auth") ||
        path.startsWith("/api/webhook") ||
        // Validation gestionnaire (auto 6) : page + API publiques, sécurisées par
        // un token signé (le gestionnaire n'a pas de compte Gufetto).
        path.startsWith("/valider-devis") ||
        path.startsWith("/api/valider-devis") ||
        path.startsWith("/_next") ||
        path === "/favicon.ico";
      if (isPublic) return true;
      if (path.startsWith("/login")) {
        if (isLoggedIn) return Response.redirect(new URL("/pipeline", request.nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isAdmin?: boolean;
    };
  }
}
