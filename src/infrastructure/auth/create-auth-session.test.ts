import type { AuthTokenStore } from '@/application/auth/auth-contracts';
import { createProductionAuthSession } from '@/infrastructure/auth/create-auth-session';

function createTokenStore(): jest.Mocked<AuthTokenStore> {
  return {
    get: jest.fn(async (_provider) => null),
    set: jest.fn(async (_provider, _value) => undefined),
    remove: jest.fn(async (_provider) => undefined),
  };
}

describe('createProductionAuthSession', () => {
  it('registers both the AniList and MyAnimeList providers', async () => {
    const session = createProductionAuthSession({
      tokenStore: createTokenStore(),
    });
    await session.restore();
    const snapshot = session.getSnapshot();
    expect(snapshot.connections.anilist).toBeDefined();
    expect(snapshot.connections.mal).toBeDefined();
    expect(snapshot.connections.anilist.state).toBe('disconnected');
    expect(snapshot.connections.mal.state).toBe('disconnected');
  });
});
