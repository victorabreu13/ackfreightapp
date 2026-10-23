import type { Role } from "@prisma/client";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { SessionUser } from "@/lib/access";
import { ACK_AGENT_KEY } from "@/lib/access";
import { emailDomainAllowed, hostedDomainAllowed } from "@/lib/auth-domains";
import { applyCanonicalAuthEnv } from "@/lib/app-url";
import { adminEmailSet, devLoginAllowed, roleOnGoogleSignIn } from "@/lib/auth-role";
import { prisma } from "@/lib/db";
import { clearFailedSignIns, normalizeCustomerEmail, recordFailedSignIn, signInBlocked, verifyPassword } from "@/lib/guias/customer-auth";

applyCanonicalAuthEnv();

const ROLE_CACHE_MS = 60_000;
const googleUserCache = new Map<string, { at: number; id: string; email: string; role: Role; name: string | null }>();

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function devLoginEnabled() {
  return devLoginAllowed({ NODE_ENV: process.env.NODE_ENV, ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN });
}

function sessionCookies() {
  const secure = process.env.NODE_ENV === "production" || (process.env.AUTH_URL ?? "").startsWith("https://");
  const prefix = secure ? "__Secure-" : "";
  const host = secure ? "__Host-" : "";
  const options = { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
  return {
    sessionToken: { name: `${prefix}ack-guias.session-token`, options },
    callbackUrl: { name: `${prefix}ack-guias.callback-url`, options },
    csrfToken: { name: `${host}ack-guias.csrf-token`, options },
    pkceCodeVerifier: { name: `${prefix}ack-guias.pkce.code_verifier`, options: { ...options, maxAge: 60 * 15 } },
    state: { name: `${prefix}ack-guias.state`, options: { ...options, maxAge: 60 * 15 } },
    nonce: { name: `${prefix}ack-guias.nonce`, options },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  cookies: sessionCookies(),
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
              params: { prompt: "select_account", hd: "ackfreight.com" },
            },
          }),
        ]
      : []),
    ...(devLoginEnabled()
      ? [
          Credentials({
            name: "Development login",
            credentials: {
              email: { label: "Email", type: "email" },
              devLogin: { label: "Dev login", type: "text" },
            },
            authorize: async (credentials) => {
              if (credentials?.devLogin !== "1" || !devLoginEnabled()) return null;
              const email = String(credentials.email ?? "").trim().toLowerCase();
              if (!emailDomainAllowed(email)) return null;
              const user = await prisma.user.findUnique({ where: { email } });
              if (!user || !user.active) return null;
              return { id: user.id, email: user.email, name: user.name, role: user.role, clientId: null, clientName: null };
            },
          }),
        ]
      : []),
    // Clients of ACK sign in with the email and the password they chose from their invitation link.
    Credentials({
      id: "customer",
      name: "Customer login",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize: async (credentials) => {
        const email = normalizeCustomerEmail(String(credentials?.email ?? ""));
        const password = String(credentials?.password ?? "");
        if (!email || !password || signInBlocked(email)) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || user.role !== "CUSTOMER" || !user.active || !(await verifyPassword(password, user.passwordHash))) {
          recordFailedSignIn(email);
          return null;
        }
        clearFailedSignIns(email);
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, name: user.name, role: user.role, clientId: user.guiaClientId, clientName: null };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return account?.provider === "credentials" || account?.provider === "customer";
      const email = profile?.email?.toLowerCase();
      const hostedDomain = (profile as { hd?: string } | undefined)?.hd;
      const verified = (profile as { email_verified?: boolean } | undefined)?.email_verified;
      if (!email || !emailDomainAllowed(email)) return false;
      if (!hostedDomainAllowed(hostedDomain)) return false;
      if (verified === false) return false;
      const admins = adminEmailSet();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing?.active === false && !admins.has(email)) return false;
      const role = roleOnGoogleSignIn(existing?.active === false ? null : existing?.role, email, admins);
      if (!role) return false;
      const picture = typeof profile?.image === "string" ? profile.image : null;
      const name = typeof profile?.name === "string" ? profile.name : null;
      await prisma.user.upsert({
        where: { email },
        update: {
          name: name ?? existing?.name,
          image: picture ?? existing?.image,
          authProvider: "google",
          role,
          active: true,
          accountingAgentKey: role === "ACCOUNTING" ? ACK_AGENT_KEY : null,
        },
        create: {
          email,
          name,
          image: picture,
          role,
          authProvider: "google",
          accountingAgentKey: role === "ACCOUNTING" ? ACK_AGENT_KEY : null,
        },
      });
      return true;
    },
    async jwt({ token, user, account }) {
      if (user && (account?.provider === "credentials" || account?.provider === "customer")) {
        token.sub = user.id;
        token.role = user.role;
        token.email = user.email;
        return token;
      }
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (account?.provider === "google" && email) {
        const cached = googleUserCache.get(email);
        let resolved = cached && Date.now() - cached.at < ROLE_CACHE_MS ? cached : null;
        if (!resolved) {
          const dbUser = await prisma.user.findUnique({ where: { email } });
          if (dbUser) {
            resolved = { at: Date.now(), id: dbUser.id, email: dbUser.email, role: dbUser.role, name: dbUser.name };
            googleUserCache.set(email, resolved);
          }
        }
        if (resolved) {
          token.sub = resolved.id;
          token.role = resolved.role;
          token.email = resolved.email;
          token.name = resolved.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as Role | undefined) ?? "VIEWER";
        session.user.clientId = null;
        session.user.clientName = null;
        if (token.email) session.user.email = token.email;
      }
      return session;
    },
  },
});

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true, active: true, accountingAgentKey: true, guiaClientId: true, guiaClient: { select: { name: true } } },
  });
  if (!dbUser?.active) return null;
  const customer = dbUser.role === "CUSTOMER";
  // Staff are ackfreight.com accounts. A client signs in with its own email and is tied to one client of the book.
  if (!customer && !emailDomainAllowed(dbUser.email)) return null;
  if (customer && !dbUser.guiaClientId) return null;
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    clientId: customer ? dbUser.guiaClientId : null,
    clientName: customer ? (dbUser.guiaClient?.name ?? null) : null,
    agentKey: dbUser.role === "ACCOUNTING" ? ACK_AGENT_KEY : null,
  };
}

export function googleLoginEnabled() {
  return googleConfigured;
}
