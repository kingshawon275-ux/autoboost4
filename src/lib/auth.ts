import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export interface UserPerms {
  canDashboard: boolean;
  canAnalytics: boolean;
  canPanels: boolean;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "MODERATOR" | "USER";
      perms: UserPerms;
    } & DefaultSession["user"];
  }
  interface User {
    role?: "ADMIN" | "MODERATOR" | "USER";
    perms?: UserPerms;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: "ADMIN" | "MODERATOR" | "USER";
    perms?: UserPerms;
  }
}

const useSecureCookies = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Stay logged in for 30 days, even after closing the app / restarting the PC.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  pages: { signIn: "/login" },
  trustHost: true,
  // Behind Hostinger's LiteSpeed proxy, NextAuth can mis-detect http vs https,
  // which breaks the PKCE cookie during Google login. Pin secure cookies +
  // SameSite so the pkceCodeVerifier survives the OAuth redirect.
  useSecureCookies,
  cookies: {
    pkceCodeVerifier: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 900,
      },
    },
    state: {
      name: `${useSecureCookies ? "__Secure-" : ""}authjs.state`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
        maxAge: 900,
      },
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;
        // OAuth-only users have no password — they must use Google.
        if (!user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Admins/moderators are always allowed; regular users must be approved.
        if (user.role === "USER" && !user.approved) {
          throw new Error("PENDING_APPROVAL");
        }

        // Best-effort login history (don't block auth on failure).
        prisma.loginHistory
          .create({ data: { userId: user.id, success: true } })
          .catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          role: user.role,
          perms: {
            canDashboard: user.canDashboard,
            canAnalytics: user.canAnalytics,
            canPanels: user.canPanels,
          },
        };
      },
    }),
  ],
  callbacks: {
    // Runs for every sign-in (Google + credentials). Enforce approval for
    // regular users; new Google users default to USER + unapproved.
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email?.toLowerCase();
        if (!email) return false;
        const existing = await prisma.user.findUnique({ where: { email } });

        if (existing) {
          if (!existing.active) return false;
          // Admins/moderators always allowed; regular users need approval.
          if (existing.role === "USER" && !existing.approved) {
            return "/login?error=PENDING_APPROVAL";
          }
          return true;
        }

        // Brand-new Google user: create the account as an UNAPPROVED user and
        // block this first sign-in until an admin approves. Notify admins.
        const created = await prisma.user.create({
          data: {
            email,
            name: user.name ?? null,
            image: user.image ?? null,
            role: "USER",
            approved: false,
            active: true,
          },
        });
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true },
        });
        if (admins.length) {
          await prisma.notification
            .createMany({
              data: admins.map((a) => ({
                type: "INFO" as const,
                title: "New registration (Google)",
                message: `${created.name ?? email} signed up with Google and is awaiting approval.`,
                userId: a.id,
              })),
            })
            .catch(() => {});
        }
        return "/login?error=PENDING_APPROVAL";
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: "ADMIN" | "MODERATOR" | "USER" }).role;
        token.perms = (user as { perms?: UserPerms }).perms;
      }
      // For Google sign-ins (and updates), load role/perms from DB.
      if ((!token.role || trigger === "update") && token.id) {
        const fresh = await prisma.user.findUnique({ where: { id: token.id } });
        if (fresh) {
          token.role = fresh.role;
          token.perms = {
            canDashboard: fresh.canDashboard,
            canAnalytics: fresh.canAnalytics,
            canPanels: fresh.canPanels,
          };
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string | undefined) ?? "";
        session.user.role =
          (token.role as "ADMIN" | "MODERATOR" | "USER" | undefined) ?? "USER";
        session.user.perms =
          token.perms ?? { canDashboard: false, canAnalytics: false, canPanels: false };
      }
      return session;
    },
  },
});
