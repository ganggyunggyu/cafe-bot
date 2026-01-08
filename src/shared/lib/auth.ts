import NextAuth from 'next-auth';
import type { NextAuthConfig, Account } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}

const naverProvider = {
  id: 'naver',
  name: 'Naver',
  type: 'oauth' as const,
  authorization: {
    url: 'https://nid.naver.com/oauth2.0/authorize',
    params: { response_type: 'code' },
  },
  token: {
    url: 'https://nid.naver.com/oauth2.0/token',
    async request({ params, provider }: { params: Record<string, string>; provider: { clientId: string; clientSecret: string } }) {
      const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
      tokenUrl.searchParams.set('grant_type', 'authorization_code');
      tokenUrl.searchParams.set('client_id', provider.clientId);
      tokenUrl.searchParams.set('client_secret', provider.clientSecret);
      tokenUrl.searchParams.set('code', params.code);
      tokenUrl.searchParams.set('state', params.state);

      const response = await fetch(tokenUrl.toString());
      const tokens = await response.json();

      return { tokens };
    },
  },
  userinfo: {
    url: 'https://openapi.naver.com/v1/nid/me',
    async request({ tokens }: { tokens: { access_token: string } }) {
      const response = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const profile = await response.json();
      return profile.response;
    },
  },
  profile(profile: { id: string; nickname?: string; email?: string; profile_image?: string }) {
    return {
      id: profile.id,
      name: profile.nickname,
      email: profile.email,
      image: profile.profile_image,
    };
  },
  clientId: process.env.NAVER_CLIENT_ID!,
  clientSecret: process.env.NAVER_CLIENT_SECRET!,
};

const refreshAccessToken = async (token: JWT): Promise<JWT> => {
  try {
    const url = new URL('https://nid.naver.com/oauth2.0/token');
    url.searchParams.set('grant_type', 'refresh_token');
    url.searchParams.set('client_id', process.env.NAVER_CLIENT_ID!);
    url.searchParams.set('client_secret', process.env.NAVER_CLIENT_SECRET!);
    url.searchParams.set('refresh_token', token.refreshToken!);

    const response = await fetch(url.toString());
    const refreshedTokens = await response.json();

    if (refreshedTokens.error) {
      throw new Error(refreshedTokens.error);
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

export const authConfig: NextAuthConfig = {
  providers: [naverProvider],
  callbacks: {
    async jwt({ token, account }: { token: JWT; account?: Account | null }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + (account.expires_in as number) * 1000,
        };
      }

      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
