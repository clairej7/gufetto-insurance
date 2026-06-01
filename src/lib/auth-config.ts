import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Lightweight auth config for middleware (no Prisma - runs on Edge)
export const authConfig: NextAuthConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");
      const isPublic = request.nextUrl.pathname.startsWith("/api/auth") ||
        request.nextUrl.pathname.startsWith("/api/webhooks") ||
        request.nextUrl.pathname.startsWith("/_next") ||
        request.nextUrl.pathname === "/favicon.ico";

      if (isPublic) return true;
      if (isLoginPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/pipeline", request.nextUrl));
        }
        return true;
      }
      if (!isLoggedIn) return false;
      return true;
    },
  },
};
