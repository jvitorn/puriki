import { fireEvent, screen } from '@testing-library/react-native';

import { EpisodeProgressControl } from '@/presentation/components/anime/episode-progress-control';
import { renderWithProviders } from '@/tests/render/test-render';

describe('EpisodeProgressControl', () => {
  it('displays known progress and changes it in both directions', async () => {
    const onIncrease = jest.fn();
    const onDecrease = jest.fn();
    await renderWithProviders(
      <EpisodeProgressControl
        current={4}
        total={12}
        onIncrease={onIncrease}
        onDecrease={onDecrease}
      />,
    );
    expect(screen.getByText('of 12 episodes')).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Increase watched episodes'));
    await fireEvent.press(screen.getByLabelText('Decrease watched episodes'));
    expect(onIncrease).toHaveBeenCalledTimes(1);
    expect(onDecrease).toHaveBeenCalledTimes(1);
  });

  it('disables invalid changes', async () => {
    const { rerender } = await renderWithProviders(
      <EpisodeProgressControl
        current={0}
        total={12}
        onIncrease={jest.fn()}
        onDecrease={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Decrease watched episodes')).toBeDisabled();
    await rerender(
      <EpisodeProgressControl
        current={12}
        total={12}
        onIncrease={jest.fn()}
        onDecrease={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Increase watched episodes')).toBeDisabled();
  });

  it('supports an unknown total and remains incrementable', async () => {
    await renderWithProviders(
      <EpisodeProgressControl
        current={44}
        total={null}
        onIncrease={jest.fn()}
        onDecrease={jest.fn()}
      />,
    );
    expect(screen.getByText('of ? episodes')).toBeVisible();
    expect(screen.getByLabelText('Increase watched episodes')).toBeEnabled();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });

  it('keeps controls enabled while saving and exposes final feedback', async () => {
    const retry = jest.fn();
    const { rerender } = await renderWithProviders(
      <EpisodeProgressControl
        current={5}
        total={12}
        saveState="saving"
        onIncrease={jest.fn()}
        onDecrease={jest.fn()}
      />,
    );
    expect(screen.getByText('Saving…')).toBeVisible();
    expect(screen.getByLabelText('Increase watched episodes')).toBeEnabled();
    expect(screen.getByLabelText('Episode progress')).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 42,
    });

    await rerender(
      <EpisodeProgressControl
        current={5}
        total={12}
        saveState="saved"
        onIncrease={jest.fn()}
        onDecrease={jest.fn()}
      />,
    );
    expect(screen.getByText('Saved')).toBeVisible();

    await rerender(
      <EpisodeProgressControl
        current={5}
        total={12}
        saveState="error"
        onIncrease={jest.fn()}
        onDecrease={jest.fn()}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save your latest progress.",
    );
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
