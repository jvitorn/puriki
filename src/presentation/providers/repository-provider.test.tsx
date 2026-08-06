import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { createAppQueryClient } from '@/presentation/providers/app-providers';
import { useRepositories } from '@/presentation/providers/repository-provider';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

function DataSourceProbe() {
  const { mode, selectDataSourceMode } = useRepositories();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Switch source"
      onPress={() => selectDataSourceMode('jikan')}
    >
      <Text>{mode}</Text>
    </Pressable>
  );
}

describe('RepositoryProvider', () => {
  it('clears React Query state when switching explicit data-source modes', async () => {
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(['stale-catalog'], 'mock data');
    await renderWithProviders(<DataSourceProbe />, {
      dependencies: createTestDependencies(),
      queryClient,
    });
    expect(screen.getByText('mock')).toBeVisible();
    fireEvent.press(screen.getByLabelText('Switch source'));
    await waitFor(() => expect(screen.getByText('jikan')).toBeVisible());
    expect(queryClient.getQueryData(['stale-catalog'])).toBeUndefined();
  });
});
