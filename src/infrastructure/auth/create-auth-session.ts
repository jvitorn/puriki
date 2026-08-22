import type {
  AuthSessionController,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import { AuthSessionCoordinator } from '@/application/auth/auth-session-coordinator';
import { AniListAuthProvider } from '@/infrastructure/auth/anilist/anilist-auth-provider';
import { AniListViewerClient } from '@/infrastructure/auth/anilist/anilist-viewer-client';
import { ExpoAniListOAuthClient } from '@/infrastructure/auth/anilist/expo-anilist-oauth-client';
import { ExpoSecureAuthTokenStore } from '@/infrastructure/auth/expo-secure-auth-token-store';
import { ExpoMalOAuthClient } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import { MalAuthProvider } from '@/infrastructure/auth/mal/mal-auth-provider';
import { MalViewerClient } from '@/infrastructure/auth/mal/mal-viewer-client';

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
  const mal = new MalAuthProvider({
    tokenStore,
    oauthClient: new ExpoMalOAuthClient(),
    viewerClient: new MalViewerClient(),
  });
  return new AuthSessionCoordinator([anilist, mal]);
}
