import { useEffect, useRef, useState } from 'react';

import {
  decrementProgress,
  incrementProgress,
} from '@/domain/rules/anime-progress';

export const EPISODE_PROGRESS_DEBOUNCE_MS = 350;

export interface UseEpisodeProgressIntentOptions {
  animeId: number;
  confirmedProgress: number;
  episodeLimit: number | null;
  mutateAsync: (variables: {
    animeId: number;
    episodes: number;
  }) => Promise<unknown>;
  debounceMs?: number;
}

export interface EpisodeProgressIntent {
  displayedProgress: number;
  increase(): void;
  decrease(): void;
}

export function useEpisodeProgressIntent({
  animeId,
  confirmedProgress,
  episodeLimit,
  mutateAsync,
  debounceMs = EPISODE_PROGRESS_DEBOUNCE_MS,
}: UseEpisodeProgressIntentOptions): EpisodeProgressIntent {
  const [localOverride, setLocalOverride] = useState<number | null>(null);
  const desiredRef = useRef(confirmedProgress);
  const lastSentRef = useRef(confirmedProgress);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animeIdRef = useRef(animeId);
  const mutateAsyncRef = useRef(mutateAsync);
  useEffect(() => {
    mutateAsyncRef.current = mutateAsync;
  });

  const displayedProgress = localOverride ?? confirmedProgress;

  function send(target: number) {
    inFlightRef.current = true;
    lastSentRef.current = target;
    mutateAsyncRef
      .current({ animeId: animeIdRef.current, episodes: target })
      .then(
        () => {
          inFlightRef.current = false;
          if (desiredRef.current !== lastSentRef.current) {
            send(desiredRef.current);
          } else {
            setLocalOverride(null);
          }
        },
        () => {
          inFlightRef.current = false;
          desiredRef.current = lastSentRef.current;
          setLocalOverride(null);
        },
      );
  }

  function flush() {
    timerRef.current = null;
    if (inFlightRef.current) return;
    if (desiredRef.current === lastSentRef.current) {
      setLocalOverride(null);
      return;
    }
    send(desiredRef.current);
  }

  // Whenever nothing is locally pending, adopt a fresh confirmed value (or a
  // changed anime) as the new baseline. Runs after render, so it never reads
  // refs during the render phase itself.
  useEffect(() => {
    const changedAnime = animeIdRef.current !== animeId;
    animeIdRef.current = animeId;
    if (changedAnime) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      inFlightRef.current = false;
    }
    if (changedAnime || (!inFlightRef.current && timerRef.current === null)) {
      desiredRef.current = confirmedProgress;
      lastSentRef.current = confirmedProgress;
      setLocalOverride(null);
    }
  }, [animeId, confirmedProgress]);

  useEffect(
    () => () => {
      if (!timerRef.current) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (inFlightRef.current || desiredRef.current === lastSentRef.current) {
        return;
      }
      const target = desiredRef.current;
      inFlightRef.current = true;
      lastSentRef.current = target;
      mutateAsyncRef
        .current({ animeId: animeIdRef.current, episodes: target })
        .catch(() => {});
    },
    [],
  );

  function applyStep(next: number) {
    if (next === desiredRef.current) return;
    desiredRef.current = next;
    setLocalOverride(next);
    if (inFlightRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, debounceMs);
  }

  return {
    displayedProgress,
    increase: () =>
      applyStep(incrementProgress(desiredRef.current, episodeLimit)),
    decrease: () => applyStep(decrementProgress(desiredRef.current)),
  };
}
