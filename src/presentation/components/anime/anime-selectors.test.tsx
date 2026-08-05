import { fireEvent, screen } from '@testing-library/react-native';

import { AnimeScoreSelector } from '@/presentation/components/anime/anime-score-selector';
import { AnimeStatusSelector } from '@/presentation/components/anime/anime-status-selector';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AnimeStatusSelector', () => {
  it('shows and changes the current status', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <AnimeStatusSelector value="watching" onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Watching' })).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );
    await fireEvent.press(screen.getByText('Completed'));
    expect(onChange).toHaveBeenCalledWith('completed');
  });
});

describe('AnimeScoreSelector', () => {
  it('selects and clears a score', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <AnimeScoreSelector value={7} onChange={onChange} />,
    );
    expect(screen.getByLabelText('Score 7')).toHaveProp('accessibilityState', {
      selected: true,
      disabled: false,
    });
    await fireEvent.press(screen.getByLabelText('Score 9'));
    await fireEvent.press(screen.getByLabelText('Clear score'));
    expect(onChange).toHaveBeenNthCalledWith(1, 9);
    expect(onChange).toHaveBeenNthCalledWith(2, null);
  });
});
