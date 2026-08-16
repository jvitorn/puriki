import type {
  AuthSessionController,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import { AuthSessionCoordinator } from '@/application/auth/auth-session-coordinator';
import { AniListAuthProvider } from '@/infrastructure/auth/anilist/anilist-auth-provider';
import { AniListViewerClient } from '@/infrastructure/auth/anilist/anilist-viewer-client';
import { ExpoAniListOAuthClient } from '@/infrastructure/auth/anilist/expo-anilist-oauth-client';
import { ExpoSecureAuthTokenStore } from '@/infrastructure/auth/expo-secure-auth-token-store';

export interface ProductionAuthSessionOptions {
  tokenStore?: AuthTokenStore;
}

export function createProductionAuthSession(
  options: ProductionAuthSessionOptions = {},
): AuthSessionController {
  const tokenStore = options.tokenStore ?? new ExpoSecureAuthTokenStore();
  const anilist = new AniListAuthProvider({
    tokenStore,
    oauthClient: new ExpoAniListOAuthClient(),
    viewerClient: new AniListViewerClient(),
  });
  return new AuthSessionCoordinator([anilist]);
}
