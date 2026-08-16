export interface AniListUserListEntryDto {
  mediaId: number;
  status: string;
  score: number | null;
  progress: number | null;
  updatedAt: number;
  idMal: number | null;
}

export interface AniListUserListChunkDto {
  entries: AniListUserListEntryDto[];
  hasNextChunk: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`AniList returned an invalid ${field}.`);
  }
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`AniList returned an invalid ${field}.`);
  }
  return value;
}

function parseEntry(value: unknown): AniListUserListEntryDto {
  if (!isRecord(value) || !isRecord(value.media)) {
    throw new Error('AniList returned an invalid media list entry.');
  }
  const mediaId = requiredInteger(value.mediaId, 'media list media ID');
  if (mediaId <= 0 || typeof value.status !== 'string') {
    throw new Error('AniList returned an invalid media list entry.');
  }
  const idMalValue = value.media.idMal;
  const idMal =
    idMalValue === null || idMalValue === undefined
      ? null
      : requiredInteger(idMalValue, 'media list MAL ID');
  if (idMal !== null && idMal <= 0) {
    throw new Error('AniList returned an invalid media list MAL ID.');
  }
  return {
    mediaId,
    status: value.status,
    score: nullableNumber(value.score, 'media list score'),
    progress: nullableNumber(value.progress, 'media list progress'),
    updatedAt: requiredInteger(value.updatedAt, 'media list timestamp'),
    idMal,
  };
}

export function parseAniListUserListChunk(
  value: unknown,
): AniListUserListChunkDto {
  if (!isRecord(value) || !isRecord(value.MediaListCollection)) {
    throw new Error('AniList returned an invalid media list collection.');
  }
  const collection = value.MediaListCollection;
  if (
    typeof collection.hasNextChunk !== 'boolean' ||
    !Array.isArray(collection.lists)
  ) {
    throw new Error('AniList returned an invalid media list collection.');
  }
  const entries = collection.lists.flatMap((list) => {
    if (!isRecord(list) || !Array.isArray(list.entries)) {
      throw new Error('AniList returned an invalid media list group.');
    }
    return list.entries.map(parseEntry);
  });
  return { entries, hasNextChunk: collection.hasNextChunk };
}
