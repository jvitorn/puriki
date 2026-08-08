import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { createMockScenario } from '@/mocks/scenarios/mock-scenarios';
import { MyListScreen } from '@/presentation/screens/my-list-screen';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

describe('MyListScreen', () => {
  it('displays list counts and filters by status', async () => {
    await renderWithProviders(<MyListScreen />);
    await waitFor(() =>
      expect(screen.getByText('25 anime • All')).toBeVisible(),
    );
    expect(
      screen.getByLabelText('Filter by All').props.accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByLabelText('Filter by Completed'));
    await waitFor(() =>
      expect(screen.getByText('5 anime • Completed')).toBeVisible(),
    );
    expect(
      screen.getByLabelText('Filter by Completed').props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByText('Ember Archive')).toBeVisible();
  });

  it('shows an empty state for a status with no entries', async () => {
    const dependencies = createTestDependencies(
      createMockScenario('watching-only'),
    );
    await renderWithProviders(<MyListScreen />, { dependencies });
    await fireEvent.press(screen.getByLabelText('Filter by Completed'));
    await waitFor(() =>
      expect(screen.getByText('No completed anime')).toBeVisible(),
    );
    expect(screen.getByText('0 anime • Completed')).toBeVisible();
  });
});
