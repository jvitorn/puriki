import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SearchScreen } from '@/presentation/screens/search-screen';
import { renderWithProviders } from '@/tests/render/test-render';

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
    await waitFor(() => expect(screen.getByText('1 results')).toBeVisible());

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
    await waitFor(() => expect(screen.getByText('No matches')).toBeVisible());
  });
});
