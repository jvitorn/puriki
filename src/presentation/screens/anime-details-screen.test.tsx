import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { createMockScenario } from '@/mocks/scenarios/mock-scenarios';
import type { SynopsisTranslationDependencies } from '@/presentation/providers/synopsis-translation-provider';
import { AnimeDetailsScreen } from '@/presentation/screens/anime-details-screen';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

function createTranslationDependencies(options?: {
  available?: boolean;
  translatedText?: string;
  cachedText?: string;
}): SynopsisTranslationDependencies & {
  translator: SynopsisTranslationDependencies['translator'] & {
    translate: jest.Mock;
  };
} {
  return {
    translator: {
      isAvailable: () => options?.available ?? true,
      translate: jest.fn().mockResolvedValue({
        translatedText: options?.translatedText ?? 'Sinopse traduzida.',
      }),
    },
    cache: {
      get: jest.fn().mockResolvedValue(
        options?.cachedText
          ? {
              version: 1,
              animeId: 1,
              sourceLanguage: 'en',
              targetLanguage: 'pt',
              sourceText: 'An English synopsis.',
              translatedText: options.cachedText,
              translatedAt: '2026-08-09T12:00:00.000Z',
            }
          : null,
      ),
      set: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('AnimeDetailsScreen', () => {
  it('displays domain data and updates progress and status', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
    expect(
      screen.queryByText('Gekko no Senjin • Moon Vanguard'),
    ).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Alternative titles'));
    expect(screen.getByText('Gekko no Senjin • Moon Vanguard')).toBeVisible();
    expect(screen.getByText('Synopsis')).toBeVisible();
    expect(screen.getByText('of 12 episodes')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Increase watched episodes'));
    await waitFor(() =>
      expect(screen.getByLabelText('Episode progress: 2 of 12')).toBeVisible(),
    );
    await fireEvent.press(screen.getByText('Plan to Watch'));
    await waitFor(() =>
      expect(screen.getByLabelText('Episode progress: 0 of 12')).toBeVisible(),
    );
  });

  it('updates and clears a score', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
    await fireEvent.press(screen.getByLabelText('Score 10'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Score 10').props.accessibilityState,
      ).toMatchObject({ selected: true, disabled: false }),
    );
    await fireEvent.press(screen.getByLabelText('Clear score'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Clear score').props.accessibilityState,
      ).toMatchObject({ selected: true, disabled: false }),
    );
  });

  it('rolls back and reports mutation errors accessibly', async () => {
    const dependencies = createTestDependencies();
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      dependencies,
    });
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
    dependencies.setForceErrors(true);
    await fireEvent.press(screen.getByLabelText('Increase watched episodes'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(
      screen.getByText('Update failed. Your previous values were restored.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Episode progress: 1 of 12')).toBeVisible();
  });

  it('handles a missing anime', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={999} />);
    await waitFor(() =>
      expect(screen.getByText('Anime not found')).toBeVisible(),
    );
  });

  it('starts a long synopsis collapsed and supports both disclosure actions', async () => {
    const dataset = createMockScenario('default');
    const first = dataset.catalog[0];
    if (!first) throw new Error('Expected a seeded anime.');
    dataset.catalog[0] = {
      ...first,
      synopsis: 'A long journey across a changing world. '.repeat(30),
    };
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      dependencies: createTestDependencies(dataset),
    });
    await waitFor(() => expect(screen.getByText('Synopsis')).toBeVisible());

    expect(screen.getByLabelText('Synopsis')).toHaveProp('numberOfLines', 4);
    await fireEvent.press(screen.getByLabelText('Read more'));
    await waitFor(() =>
      expect(screen.getByLabelText('Show less')).toBeVisible(),
    );
    expect(
      screen.getByLabelText('Synopsis').props.numberOfLines,
    ).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('Show less'));
    expect(screen.getByLabelText('Synopsis')).toHaveProp('numberOfLines', 4);
  });

  it('renders missing optional metadata without empty disclosure sections', async () => {
    const dataset = createMockScenario('default');
    const first = dataset.catalog[0];
    if (!first) throw new Error('Expected a seeded anime.');
    dataset.catalog[0] = {
      ...first,
      alternativeTitles: [],
      genres: [],
      score: null,
      season: null,
      studios: [],
      synopsis: '',
      totalEpisodes: null,
      year: null,
    };
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      dependencies: createTestDependencies(dataset),
    });
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );

    expect(screen.queryByText('Synopsis')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Alternative titles')).not.toBeOnTheScreen();
    expect(screen.getByText('Episodes TBD')).toBeVisible();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('keeps the English synopsis unchanged without a translation action', async () => {
    const dataset = createMockScenario('default');
    const anime = dataset.catalog[0];
    if (!anime) throw new Error('Expected a seeded anime.');
    anime.synopsis = 'The original English synopsis.';
    await renderWithProviders(<AnimeDetailsScreen animeId={anime.id} />, {
      dependencies: createTestDependencies(dataset),
    });
    await waitFor(() => expect(screen.getByText('Synopsis')).toBeVisible());
    expect(screen.queryByText('Translate with Google')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Synopsis')).toHaveTextContent(
      'The original English synopsis.',
    );
  });

  it('translates a Portuguese synopsis on demand and toggles the immutable original', async () => {
    const dataset = createMockScenario('default');
    const anime = dataset.catalog[0];
    if (!anime) throw new Error('Expected a seeded anime.');
    anime.synopsis = 'An English synopsis.';
    const dependencies = createTestDependencies(dataset);
    const getDetails = jest.spyOn(
      dependencies.catalogRepository,
      'getDetailsById',
    );
    const translationDependencies = createTranslationDependencies({
      translatedText: 'Uma sinopse em português.',
    });
    await renderWithProviders(<AnimeDetailsScreen animeId={anime.id} />, {
      dependencies,
      languagePreference: 'pt-BR',
      translationDependencies,
    });
    await waitFor(() =>
      expect(screen.getByText('Traduzir com o Google')).toBeVisible(),
    );
    expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
      'An English synopsis.',
    );

    await fireEvent.press(screen.getByText('Traduzir com o Google'));
    await waitFor(() =>
      expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
        'Uma sinopse em português.',
      ),
    );
    expect(
      screen.getByLabelText('Tradução fornecida pelo Google Tradutor'),
    ).toBeVisible();
    expect(anime.synopsis).toBe('An English synopsis.');

    await fireEvent.press(screen.getByText('Ver original'));
    expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
      'An English synopsis.',
    );
    expect(
      screen.queryByLabelText('Tradução fornecida pelo Google Tradutor'),
    ).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Ver tradução do Google'));
    expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
      'Uma sinopse em português.',
    );
    expect(translationDependencies.translator.translate).toHaveBeenCalledTimes(
      1,
    );
    expect(getDetails).toHaveBeenCalledTimes(1);
  });

  it('uses a persistent Portuguese cache without a native translation call', async () => {
    const dataset = createMockScenario('default');
    const anime = dataset.catalog[0];
    if (!anime) throw new Error('Expected a seeded anime.');
    anime.synopsis = 'An English synopsis.';
    const translationDependencies = createTranslationDependencies({
      cachedText: 'Tradução persistida.',
    });
    await renderWithProviders(<AnimeDetailsScreen animeId={anime.id} />, {
      dependencies: createTestDependencies(dataset),
      languagePreference: 'pt-BR',
      translationDependencies,
    });

    await fireEvent.press(await screen.findByText('Traduzir com o Google'));
    await waitFor(() =>
      expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
        'Tradução persistida.',
      ),
    );
    expect(translationDependencies.translator.translate).not.toHaveBeenCalled();
  });

  it('translates Spanish independently with localized Google wording', async () => {
    const dataset = createMockScenario('default');
    const anime = dataset.catalog[0];
    if (!anime) throw new Error('Expected a seeded anime.');
    anime.synopsis = 'An English synopsis.';
    const translationDependencies = createTranslationDependencies({
      translatedText: 'Una sinopsis en español.',
    });
    await renderWithProviders(<AnimeDetailsScreen animeId={anime.id} />, {
      dependencies: createTestDependencies(dataset),
      languagePreference: 'es',
      translationDependencies,
    });

    await fireEvent.press(await screen.findByText('Traducir con Google'));
    await waitFor(() =>
      expect(screen.getByLabelText('Sinopsis')).toHaveTextContent(
        'Una sinopsis en español.',
      ),
    );
    expect(translationDependencies.translator.translate).toHaveBeenCalledWith({
      text: 'An English synopsis.',
      sourceLanguage: 'en',
      targetLanguage: 'es',
    });
    expect(
      screen.getByLabelText('Con la tecnología de Google Translate'),
    ).toBeVisible();
  });

  it('keeps the original visible after an inline failure and allows retry', async () => {
    const dataset = createMockScenario('default');
    const anime = dataset.catalog[0];
    if (!anime) throw new Error('Expected a seeded anime.');
    anime.synopsis = 'An English synopsis.';
    const translationDependencies = createTranslationDependencies();
    translationDependencies.translator.translate
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce({
        translatedText: 'Sinopse após nova tentativa.',
      });
    await renderWithProviders(<AnimeDetailsScreen animeId={anime.id} />, {
      dependencies: createTestDependencies(dataset),
      languagePreference: 'pt-BR',
      translationDependencies,
    });

    await fireEvent.press(await screen.findByText('Traduzir com o Google'));
    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível traduzir a sinopse.'),
      ).toBeVisible(),
    );
    expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
      'An English synopsis.',
    );

    await fireEvent.press(
      screen.getByLabelText('Tentar traduzir a sinopse novamente'),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Sinopse')).toHaveTextContent(
        'Sinopse após nova tentativa.',
      ),
    );
  });

  it('does not crash or show the action when the native translator is unavailable', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      languagePreference: 'pt-BR',
      translationDependencies: createTranslationDependencies({
        available: false,
      }),
    });
    await waitFor(() => expect(screen.getByText('Sinopse')).toBeVisible());
    expect(screen.queryByText('Traduzir com o Google')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Sinopse')).toBeVisible();
  });
});
