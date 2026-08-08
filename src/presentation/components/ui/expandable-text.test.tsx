import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ExpandableText } from '@/presentation/components/ui/expandable-text';
import { renderWithProviders } from '@/tests/render/test-render';

describe('ExpandableText', () => {
  const longText = Array.from(
    { length: 40 },
    () => 'A thoughtful story about friendship, memory, and a distant summer.',
  ).join(' ');

  it('starts collapsed, expands, and collapses again', async () => {
    await renderWithProviders(<ExpandableText text={longText} />);
    expect(screen.getByLabelText('Synopsis')).toHaveProp('numberOfLines', 4);
    expect(
      screen.getByLabelText('Read more').props.accessibilityState,
    ).toMatchObject({ expanded: false });

    await fireEvent.press(screen.getByLabelText('Read more'));
    await waitFor(() =>
      expect(screen.getByLabelText('Show less')).toBeVisible(),
    );
    expect(
      screen.getByLabelText('Synopsis').props.numberOfLines,
    ).toBeUndefined();
    expect(
      screen.getByLabelText('Show less').props.accessibilityState,
    ).toMatchObject({ expanded: true });

    await fireEvent.press(screen.getByLabelText('Show less'));
    expect(screen.getByLabelText('Synopsis')).toHaveProp('numberOfLines', 4);
  });

  it('does not show disclosure controls for short text', async () => {
    await renderWithProviders(<ExpandableText text="A short synopsis." />);
    expect(screen.queryByLabelText('Read more')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Show less')).not.toBeOnTheScreen();
  });
});
