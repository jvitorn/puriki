import { fireEvent, screen } from '@testing-library/react-native';

import { getAllowedStatusTransitions } from '@/domain/rules/anime-status';
import { AnimeScoreSelector } from '@/presentation/components/anime/anime-score-selector';
import { AnimeStatusSelector } from '@/presentation/components/anime/anime-status-selector';
import { renderWithProviders } from '@/tests/render/test-render';

const transitions = getAllowedStatusTransitions(
  {
    animeId: 1,
    status: 'watching',
    watchedEpisodes: 2,
    userScore: null,
    updatedAt: '',
  },
  { totalEpisodes: 12, airingStatus: 'finished' },
);

describe('AnimeStatusSelector', () => {
  it('shows and changes the current status', async () => {
    const onChange = jest.fn();
    const onBlocked = jest.fn();
    await renderWithProviders(
      <AnimeStatusSelector
        value="watching"
        transitions={transitions}
        onBlocked={onBlocked}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole('radio', { name: 'Watching' }).props.accessibilityState,
    ).toMatchObject({ selected: true, disabled: false });
    await fireEvent.press(screen.getByText('Completed'));
    expect(onChange).toHaveBeenCalledWith('completed');
    await fireEvent.press(screen.getByText('Plan to Watch'));
    expect(onBlocked).toHaveBeenCalledWith('already_started');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('AnimeScoreSelector', () => {
  it('selects and clears a score', async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <AnimeScoreSelector value={7} onChange={onChange} />,
    );
    expect(
      screen.getByLabelText('Score 7').props.accessibilityState,
    ).toMatchObject({ selected: true, disabled: false });
    await fireEvent.press(screen.getByLabelText('Score 9'));
    await fireEvent.press(screen.getByLabelText('Clear score'));
    expect(onChange).toHaveBeenNthCalledWith(1, 9);
    expect(onChange).toHaveBeenNthCalledWith(2, null);
  });
});
