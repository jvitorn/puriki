import { AuthOperationError } from '@/application/auth/auth-contracts';
import { ANILIST_GRAPHQL_ENDPOINT } from '@/infrastructure/api/anilist/anilist-client';

export const ANILIST_VIEWER_QUERY = /* GraphQL */ `
  query AuthenticatedViewer {
    Viewer {
      id
      name
      avatar {
        large
      }
    }
  }
`;

export const ANILIST_VIEWER_TIMEOUT_MS = 12_000;

export interface AniListViewer {
  id: number;
  name: string;
  avatarUrl: string | null;
}

export interface AniListViewerClientPort {
  getViewer(accessToken: string): Promise<AniListViewer>;
}

export interface AniListViewerClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

interface GraphQLErrorShape {
  message: string;
  status: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function graphQLErrors(value: unknown): GraphQLErrorShape[] {
  if (!Array.isArray(value)) return [];
  return value.map((error) => {
    if (!isRecord(error)) return { message: '', status: null };
    return {
      message: typeof error.message === 'string' ? error.message : '',
      status:
        typeof error.status === 'number' && Number.isFinite(error.status)
          ? error.status
          : null,
    };
  });
}

function isUnauthorized(status: number, errors: GraphQLErrorShape[]): boolean {
  return (
    status === 401 ||
    status === 403 ||
    errors.some(
      (error) =>
        error.status === 401 ||
        error.status === 403 ||
        /unauthenticated|invalid.{0,12}token|token.{0,12}(expired|invalid)/i.test(
          error.message,
        ),
    )
  );
}

function parseViewer(data: unknown): AniListViewer {
  if (!isRecord(data) || !isRecord(data.Viewer)) {
    throw new AuthOperationError('invalid_response', { canRetry: true });
  }
  const viewer = data.Viewer;
  if (
    typeof viewer.id !== 'number' ||
    !Number.isInteger(viewer.id) ||
    viewer.id <= 0 ||
    typeof viewer.name !== 'string' ||
    viewer.name.trim().length === 0
  ) {
    throw new AuthOperationError('invalid_response', { canRetry: true });
  }
  let avatarUrl: string | null = null;
  if (viewer.avatar !== null && viewer.avatar !== undefined) {
    if (!isRecord(viewer.avatar)) {
      throw new AuthOperationError('invalid_response', { canRetry: true });
    }
    avatarUrl =
      typeof viewer.avatar.large === 'string' ? viewer.avatar.large : null;
  }
  return { id: viewer.id, name: viewer.name, avatarUrl };
}

export class AniListViewerClient implements AniListViewerClientPort {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;

  constructor(options: AniListViewerClientOptions = {}) {
    this.endpoint = options.endpoint ?? ANILIST_GRAPHQL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? ANILIST_VIEWER_TIMEOUT_MS;
    this.setTimer = options.setTimeoutImpl ?? setTimeout;
    this.clearTimer = options.clearTimeoutImpl ?? clearTimeout;
  }

  async getViewer(accessToken: string): Promise<AniListViewer> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = this.setTimer(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: ANILIST_VIEWER_QUERY, variables: {} }),
        signal: controller.signal,
      });
      let payload: unknown;
      try {
        payload = JSON.parse(await response.text()) as unknown;
      } catch {
        if (response.status >= 500) {
          throw new AuthOperationError('provider_unavailable', {
            canRetry: true,
          });
        }
        throw new AuthOperationError('invalid_response', { canRetry: true });
      }
      const errors = isRecord(payload) ? graphQLErrors(payload.errors) : [];
      if (isUnauthorized(response.status, errors)) {
        throw new AuthOperationError('invalid_token', {
          reconnectRequired: true,
        });
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AuthOperationError('provider_unavailable', {
          canRetry: true,
        });
      }
      if (
        response.status < 200 ||
        response.status >= 300 ||
        errors.length > 0
      ) {
        throw new AuthOperationError('invalid_response', { canRetry: true });
      }
      if (!isRecord(payload)) {
        throw new AuthOperationError('invalid_response', { canRetry: true });
      }
      return parseViewer(payload.data);
    } catch (error: unknown) {
      if (error instanceof AuthOperationError) throw error;
      throw new AuthOperationError(timedOut ? 'timeout' : 'network', {
        canRetry: true,
      });
    } finally {
      this.clearTimer(timeout);
    }
  }
}
