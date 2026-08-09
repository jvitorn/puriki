import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { createMockScenario } from '@/mocks/scenarios/mock-scenarios';
import { AnimeDetailsScreen } from '@/presentation/screens/anime-details-screen';
import { HomeScreen } from '@/presentation/screens/home-screen';
import { MyListScreen } from '@/presentation/screens/my-list-screen';
import { SearchScreen } from '@/presentation/screens/search-screen';
import { SettingsScreen } from '@/presentation/screens/settings-screen';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

jest.mock('@/infrastructure/api/jikan/jikan-diagnostics', () => ({
  runJikanConnectivityDiagnostic: jest.fn(),
}));
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
    expect(screen.getByText('Fonte de dados')).toBeVisible();
    expect(
      screen.getByLabelText('Ferramentas de desenvolvimento'),
    ).toBeVisible();
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
    const dataset = createMockScenario('default');
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

  it('localizes the developer generator without changing its 100-item semantics', async () => {
    const dependencies = createTestDependencies();
    await renderWithProviders(<SettingsScreen />, {
      dependencies,
      languagePreference: 'pt-BR',
    });
    await fireEvent.press(
      screen.getByLabelText('Ferramentas de desenvolvimento'),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Gerar lista de teste com 100 itens'),
      ).toBeVisible(),
    );
    await fireEvent.press(
      screen.getByLabelText('Gerar lista de teste com 100 itens'),
    );
    await waitFor(() =>
      expect(
        screen.getByText('Lista de teste com 100 itens criada.'),
      ).toBeVisible(),
    );
    await expect(
      dependencies.userListRepository.getPage({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({ totalCount: 100 });
  });
});
