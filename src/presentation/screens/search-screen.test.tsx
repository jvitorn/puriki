import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SearchScreen } from '@/presentation/screens/search-screen';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

describe('SearchScreen', () => {
  afterEach(() => jest.useRealTimers());

  it('searches title and alternative title, then shows empty results', async () => {
    jest.useFakeTimers();
    await renderWithProviders(<SearchScreen />);
    await act(async () => Promise.resolve());
    const input = screen.getByLabelText('Search anime');

    await fireEvent.changeText(input, 'Neon Ronin');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() => expect(screen.getByText('Neon Ronin')).toBeVisible());
    await waitFor(() => expect(screen.getByText('1 result')).toBeVisible());

    await fireEvent.changeText(input, 'Gekko no Senjin');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );

    await fireEvent.changeText(input, 'no such local anime');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() =>
      expect(screen.getByText('No anime found')).toBeVisible(),
    );
  });

  it('explains the minimum query length and clears entered text', async () => {
    await renderWithProviders(<SearchScreen />);
    const input = screen.getByLabelText('Search anime');

    await fireEvent.changeText(input, 'n');
    expect(
      screen.getByText('Type at least 2 characters to search'),
    ).toBeVisible();
    expect(screen.getByText('Keep typing')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(input).toHaveProp('value', '');
  });

  it('uses grid-shaped skeletons while discovery content is loading', async () => {
    const dependencies = createTestDependencies();
    dependencies.catalogRepository.getPopular = jest.fn(
      () => new Promise(() => undefined),
    );
    await renderWithProviders(<SearchScreen />, { dependencies });

    expect(screen.getAllByLabelText('Loading content').length).toBeGreaterThan(
      1,
    );
  });
});
