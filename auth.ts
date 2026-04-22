import NextAuth from "next-auth"
import Zitadel from "next-auth/providers/zitadel"
import type { JWT } from "next-auth/jwt"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Zitadel({
      clientId: process.env.AUTH_ZITADEL_ID!,
      issuer: process.env.AUTH_ZITADEL_ISSUER!,
    }),
  ],

  debug: true,

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async jwt({ token, account }) {
      // First sign-in: account contains the raw token response from Keycloak
      if (account) {
        return {
          ...token,
          accessToken: account.access_token!,
          refreshToken: account.refresh_token!,
          accessTokenExpires: Date.now() + (account.expires_in ?? 300) * 1000,
        }
      }

      // Token still valid
      if (Date.now() < token.accessTokenExpires) {
        return token
      }

      // Access token expired — refresh it
      return refreshAccessToken(token)
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken
      if (token.error) {
        session.error = token.error
      }
      return session
    },
  },

  pages: {
    signIn: "/",
  },
})

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const tokenUrl = `${process.env.AUTH_ZITADEL_ISSUER}/oauth/v2/token`

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_ZITADEL_ID!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    })

    const refreshed = await response.json()

    if (!response.ok) throw refreshed

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      error: undefined,
    }
  } catch {
    return { ...token, error: "RefreshAccessTokenError" }
  }
}
