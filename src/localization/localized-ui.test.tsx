import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AnimeDetailsScreen } from '@/presentation/screens/anime-details-screen';
import { HomeScreen } from '@/presentation/screens/home-screen';
import { MyListScreen } from '@/presentation/screens/my-list-screen';
import { SearchScreen } from '@/presentation/screens/search-screen';
import { SettingsScreen } from '@/presentation/screens/settings-screen';
import { createTestScenario } from '@/tests/fixtures/anime-dataset';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

jest.mock('@/infrastructure/api/mal/mal-diagnostics', () => ({
  runMalConnectivityDiagnostic: jest.fn(),
}));

describe('localized core UI', () => {
  it.each([
    ['en', 'Continue Watching'],
    ['pt-BR', 'Continuar assistindo'],
    ['es', 'Continuar viendo'],
  ] as const)(
    'renders the Home sections in %s',
    async (languagePreference, label) => {
      await renderWithProviders(<HomeScreen />, { languagePreference });
      await waitFor(() => expect(screen.getByText(label)).toBeVisible());
    },
  );

  it('renders representative settings strings in Brazilian Portuguese', async () => {
    await renderWithProviders(<SettingsScreen />, {
      languagePreference: 'pt-BR',
    });
    await waitFor(() =>
      expect(screen.getByText('Configurações')).toBeVisible(),
    );
    expect(screen.getByText('Conta')).toBeVisible();
    expect(screen.getByText('Idioma')).toBeVisible();
    expect(screen.getByText('Sobre')).toBeVisible();
    expect(
      screen.queryByText('Ferramentas de desenvolvimento'),
    ).not.toBeOnTheScreen();
  });

  it('renders Spanish UI while preserving catalog titles', async () => {
    await renderWithProviders(<SearchScreen />, {
      dependencies: createTestDependencies(),
      languagePreference: 'es',
    });
    expect(screen.getByText('Buscar')).toBeVisible();
    expect(screen.getByLabelText('Buscar anime')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText('Ember Archive')).toBeVisible(),
    );
  });

  it('renders Portuguese search guidance', async () => {
    await renderWithProviders(<SearchScreen />, {
      languagePreference: 'pt-BR',
    });
    await fireEvent.changeText(screen.getByLabelText('Buscar anime'), 'a');
    await waitFor(() =>
      expect(
        screen.getByText('Digite pelo menos 2 caracteres para buscar'),
      ).toBeVisible(),
    );
    expect(screen.getByText('Continue digitando')).toBeVisible();
  });

  it('translates list filters without changing repository status IDs', async () => {
    const dependencies = createTestDependencies();
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    await renderWithProviders(<MyListScreen />, {
      dependencies,
      languagePreference: 'pt-BR',
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Filtrar por Assistindo')).toBeVisible(),
    );
    fireEvent.press(screen.getByLabelText('Filtrar por Assistindo'));
    await waitFor(() =>
      expect(getPage).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 25,
        status: 'watching',
      }),
    );
  });

  it('translates Details UI but leaves synopsis content untouched', async () => {
    const dataset = createTestScenario('default');
    const anime = dataset.catalog[0];
    if (!anime) throw new Error('Expected a seeded anime.');
    anime.synopsis = 'A young mage begins a journey.';
    await renderWithProviders(<AnimeDetailsScreen animeId={anime.id} />, {
      dependencies: createTestDependencies(dataset),
      languagePreference: 'pt-BR',
    });
    await waitFor(() => expect(screen.getByText('Sinopse')).toBeVisible());
    expect(screen.getByText('A young mage begins a journey.')).toBeVisible();
  });
});
