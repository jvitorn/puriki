import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { getSynopsisTranslationTarget } from '@/application/translation/synopsis-language';
import type { CachedSynopsisTranslation } from '@/domain/repositories/synopsis-translation-cache';
import {
  asSynopsisTranslationError,
  SynopsisTranslationError,
} from '@/domain/services/synopsis-translator';
import type { AppLanguage } from '@/localization/languages';
import { useSynopsisTranslationDependencies } from '@/presentation/providers/synopsis-translation-provider';

type TranslationState =
  | { status: 'idle'; identity: string }
  | { status: 'loading'; identity: string }
  | {
      status: 'success';
      identity: string;
      translatedText: string;
    }
  | {
      status: 'error';
      identity: string;
      error: SynopsisTranslationError;
    };

interface UseSynopsisTranslationOptions {
  animeId: number;
  synopsis: string;
  appLanguage: AppLanguage;
}

const useIsomorphicLayoutEffect =
  Platform.OS === 'web' ? useEffect : useLayoutEffect;

function requestIdentity(
  animeId: number,
  synopsis: string,
  targetLanguage: string | null,
): string {
  return JSON.stringify([animeId, targetLanguage, synopsis]);
}

export function useSynopsisTranslation({
  animeId,
  synopsis,
  appLanguage,
}: UseSynopsisTranslationOptions) {
  const { translator, cache } = useSynopsisTranslationDependencies();
  const targetLanguage = getSynopsisTranslationTarget(appLanguage);
  const identity = requestIdentity(animeId, synopsis, targetLanguage);
  const identityRef = useRef(identity);
  const mountedRef = useRef(true);
  const activeRequestsRef = useRef(new Map<string, symbol>());
  const [state, setState] = useState<TranslationState>({
    status: 'idle',
    identity,
  });
  const [showingOriginal, setShowingOriginal] = useState(true);

  useIsomorphicLayoutEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const translate = useCallback(async () => {
    if (targetLanguage === null) return;
    if (!translator.isAvailable()) {
      setState({
        status: 'error',
        identity,
        error: new SynopsisTranslationError(
          'translator_unavailable',
          'The native translator is unavailable.',
        ),
      });
      return;
    }
    if (activeRequestsRef.current.has(identity)) return;

    const requestToken = Symbol(identity);
    activeRequestsRef.current.set(identity, requestToken);
    setShowingOriginal(true);
    setState({ status: 'loading', identity });

    const lookup = {
      animeId,
      sourceLanguage: 'en' as const,
      targetLanguage,
      sourceText: synopsis,
    };

    try {
      let cached: CachedSynopsisTranslation | null = null;
      try {
        cached = await cache.get(lookup);
      } catch {
        // Local storage failures behave as a cache miss.
      }

      if (!mountedRef.current || identityRef.current !== identity) return;

      if (cached) {
        setShowingOriginal(false);
        setState({
          status: 'success',
          identity,
          translatedText: cached.translatedText,
        });
        return;
      }

      const result = await translator.translate({
        text: synopsis,
        sourceLanguage: 'en',
        targetLanguage,
      });
      if (result.translatedText.trim().length === 0) {
        throw new SynopsisTranslationError(
          'empty_translation',
          'The translator returned an empty synopsis.',
        );
      }
      if (!mountedRef.current || identityRef.current !== identity) return;

      setShowingOriginal(false);
      setState({
        status: 'success',
        identity,
        translatedText: result.translatedText,
      });

      try {
        await cache.set({
          ...lookup,
          version: 1,
          translatedText: result.translatedText,
          translatedAt: new Date().toISOString(),
        });
      } catch {
        // A successful in-memory translation must survive cache write failures.
      }
    } catch (error) {
      if (mountedRef.current && identityRef.current === identity) {
        setShowingOriginal(true);
        setState({
          status: 'error',
          identity,
          error: asSynopsisTranslationError(error),
        });
      }
    } finally {
      if (activeRequestsRef.current.get(identity) === requestToken) {
        activeRequestsRef.current.delete(identity);
      }
    }
  }, [animeId, cache, identity, synopsis, targetLanguage, translator]);

  const currentState: TranslationState =
    state.identity === identity ? state : { status: 'idle', identity };
  const translatedText =
    currentState.status === 'success' ? currentState.translatedText : undefined;
  const isTranslated = translatedText !== undefined;

  return {
    canTranslate: targetLanguage !== null && translator.isAvailable(),
    isTranslating: currentState.status === 'loading',
    isTranslated,
    displayedText: isTranslated && !showingOriginal ? translatedText : synopsis,
    showingOriginal: !isTranslated || showingOriginal,
    error: currentState.status === 'error' ? currentState.error : null,
    translate,
    retry: translate,
    showOriginal: () => setShowingOriginal(true),
    showTranslation: () => {
      if (isTranslated) setShowingOriginal(false);
    },
  };
}
