import type { UserAnimeEntry } from '@/domain/models/anime';

export interface ProgressIntentWriter {
  updateProgress(animeId: number, episodes: number): Promise<UserAnimeEntry>;
}

interface PendingProgressIntent {
  desiredEpisodes: number;
  promise?: Promise<UserAnimeEntry>;
}

export class LatestProgressIntentCoordinator {
  private readonly pending = new Map<number, PendingProgressIntent>();

  constructor(private readonly writer: ProgressIntentWriter) {}

  submit(animeId: number, episodes: number): Promise<UserAnimeEntry> {
    const existing = this.pending.get(animeId);
    if (existing) {
      existing.desiredEpisodes = episodes;
      return existing.promise as Promise<UserAnimeEntry>;
    }

    const intent: PendingProgressIntent = {
      desiredEpisodes: episodes,
    };
    this.pending.set(animeId, intent);
    intent.promise = this.drain(animeId, intent);
    return intent.promise;
  }

  private async drain(
    animeId: number,
    intent: PendingProgressIntent,
  ): Promise<UserAnimeEntry> {
    try {
      let confirmed: UserAnimeEntry;
      do {
        const sentEpisodes = intent.desiredEpisodes;
        confirmed = await this.writer.updateProgress(animeId, sentEpisodes);
        if (sentEpisodes === intent.desiredEpisodes) return confirmed;
      } while (true);
    } finally {
      if (this.pending.get(animeId) === intent) this.pending.delete(animeId);
    }
  }
}
