import type { InfiniteData } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { queryKeys } from '@/application/queries/query-keys';
import type { UnifiedAnime } from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import { createMockScenario } from '@/mocks/scenarios/mock-scenarios';
import { MyListScreen } from '@/presentation/screens/my-list-screen';
import { buildUserListDataset } from '@/tests/builders/mock-dataset-builder';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

describe('MyListScreen', () => {
  const getLoadedPages = (queryClient: {
    getQueryData<T>(queryKey: readonly unknown[]): T | undefined;
  }) =>
    queryClient.getQueryData<InfiniteData<PageResult<UnifiedAnime>, number>>(
      queryKeys.infiniteUserList(),
    )?.pages;

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
    await renderWithProviders(<MyListScreen />, {
      dependencies,
    });
    await fireEvent.press(screen.getByLabelText('Filter by Completed'));
    await waitFor(() =>
      expect(screen.getByText('No completed anime')).toBeVisible(),
    );
    expect(screen.getByText('0 anime • Completed')).toBeVisible();
  });

  it('loads a 250-entry list one page at a time near the end', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 250 }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const getMany = jest.spyOn(dependencies.catalogRepository, 'getManyByIds');
    const { queryClient, unmount } = await renderWithProviders(
      <MyListScreen />,
      { dependencies },
    );

    await waitFor(() =>
      expect(screen.getByText('250 anime • All')).toBeVisible(),
    );
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getMany.mock.calls[0]?.[0]).toHaveLength(25);

    fireEvent(screen.getByTestId('my-list'), 'onEndReached');
    await waitFor(() => expect(getLoadedPages(queryClient)).toHaveLength(2));
    expect(getPage).toHaveBeenCalledTimes(2);
    expect(getPage).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 25,
      status: undefined,
    });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    unmount();
  });

  it('coalesces repeated end-reached events while the next page is pending', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 53 }),
    );
    dependencies.setDelayMode('normal');
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const { queryClient, unmount } = await renderWithProviders(
      <MyListScreen />,
      { dependencies },
    );
    await waitFor(() => expect(screen.getByTestId('my-list')).toBeVisible());

    fireEvent(screen.getByTestId('my-list'), 'onEndReached');
    fireEvent(screen.getByTestId('my-list'), 'onEndReached');
    fireEvent(screen.getByTestId('my-list'), 'onEndReached');
    await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Generated Anime 1')).toBeVisible();
    expect(screen.getAllByLabelText('Loading content')).toHaveLength(8);

    await waitFor(() => expect(getLoadedPages(queryClient)).toHaveLength(2), {
      timeout: 2_000,
    });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    unmount();
  });
});
