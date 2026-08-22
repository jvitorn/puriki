import { AuthOperationError } from '@/application/auth/auth-contracts';

export const MAL_VIEWER_ENDPOINT =
  'https://api.myanimelist.net/v2/users/@me?fields=id,name,picture';

export const MAL_VIEWER_TIMEOUT_MS = 12_000;

export interface MalViewer {
  id: number;
  name: string;
  avatarUrl: string | null;
}

export interface MalViewerClientPort {
  getViewer(accessToken: string): Promise<MalViewer>;
}

export interface MalViewerClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseViewer(data: unknown): MalViewer {
  if (!isRecord(data)) {
    throw new AuthOperationError('invalid_response', { canRetry: true });
  }
  if (
    typeof data.id !== 'number' ||
    !Number.isInteger(data.id) ||
    data.id <= 0 ||
    typeof data.name !== 'string' ||
    data.name.trim().length === 0
  ) {
    throw new AuthOperationError('invalid_response', { canRetry: true });
  }
  const avatarUrl =
    typeof data.picture === 'string' && data.picture.trim().length > 0
      ? data.picture
      : null;
  return { id: data.id, name: data.name, avatarUrl };
}

export class MalViewerClient implements MalViewerClientPort {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;

  constructor(options: MalViewerClientOptions = {}) {
    this.endpoint = options.endpoint ?? MAL_VIEWER_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? MAL_VIEWER_TIMEOUT_MS;
    this.setTimer = options.setTimeoutImpl ?? setTimeout;
    this.clearTimer = options.clearTimeoutImpl ?? clearTimeout;
  }

  async getViewer(accessToken: string): Promise<MalViewer> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = this.setTimer(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
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
      if (response.status === 401 || response.status === 403) {
        throw new AuthOperationError('invalid_token', {
          reconnectRequired: true,
        });
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AuthOperationError('provider_unavailable', {
          canRetry: true,
        });
      }
      if (response.status < 200 || response.status >= 300) {
        throw new AuthOperationError('invalid_response', { canRetry: true });
      }
      return parseViewer(payload);
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
