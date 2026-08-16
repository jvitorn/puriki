import type { InfiniteData } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { queryKeys } from '@/application/queries/query-keys';
import type { UnifiedAnime } from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import { MyListScreen } from '@/presentation/screens/my-list-screen';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';
import {
  buildUserListDataset,
  createTestScenario,
} from '@/tests/fixtures/anime-dataset';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

function connectedAniListSession(): TestAuthSessionController {
  const session = new TestAuthSessionController();
  session.updateConnection('anilist', {
    state: 'connected',
    account: {
      provider: 'anilist',
      userId: '42',
      username: 'reader',
      avatarUrl: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
    operation: 'idle',
    failure: null,
    canRetry: false,
  });
  return session;
}

describe('MyListScreen', () => {
  const getLoadedPages = (queryClient: {
    getQueryData<T>(queryKey: readonly unknown[]): T | undefined;
  }) =>
    queryClient.getQueryData<InfiniteData<PageResult<UnifiedAnime>, number>>(
      queryKeys.infiniteUserList('guest'),
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
      createTestScenario('watching-only'),
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

  it('shows the dedicated empty state for a new guest list', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 0 }),
    );
    await renderWithProviders(<MyListScreen />, { dependencies });

    await waitFor(() =>
      expect(screen.getByText('Your list is empty.')).toBeVisible(),
    );
    expect(
      screen.getByText('Explore anime and add what you want to watch.'),
    ).toBeVisible();
    expect(screen.getByText('0 anime • All')).toBeVisible();
  });

  it('renders the active AniList account list after loading', async () => {
    await renderWithProviders(<MyListScreen />, {
      authSession: connectedAniListSession(),
    });

    await waitFor(() =>
      expect(screen.getByText('25 anime • All')).toBeVisible(),
    );
    expect(screen.getByText('Neon Ronin')).toBeVisible();
  });

  it('keeps the AniList skeleton visible until a valid empty snapshot arrives', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 0 }),
    );
    let resolvePage: ((page: PageResult<never>) => void) | undefined;
    dependencies.userListRepository.getPage = jest.fn(
      () =>
        new Promise((resolve) => {
          resolvePage = resolve;
        }),
    );

    await renderWithProviders(<MyListScreen />, {
      authSession: connectedAniListSession(),
      dependencies,
    });

    expect(screen.getAllByLabelText('Loading content')).not.toHaveLength(0);
    expect(screen.queryByText('Your list is empty.')).not.toBeOnTheScreen();

    await act(async () =>
      resolvePage?.({ items: [], page: 1, nextPage: null, totalCount: 0 }),
    );
    await waitFor(() =>
      expect(screen.getByText('Your list is empty.')).toBeVisible(),
    );
  });

  it('shows a retryable AniList session error instead of a guest empty state', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 0 }),
    );
    dependencies.userListRepository.getPage = jest
      .fn()
      .mockRejectedValueOnce(
        new Error('The AniList session is no longer valid.'),
      )
      .mockResolvedValue({
        items: [],
        page: 1,
        nextPage: null,
        totalCount: 0,
      });

    await renderWithProviders(<MyListScreen />, {
      authSession: connectedAniListSession(),
      dependencies,
    });

    await waitFor(() =>
      expect(screen.getByText('Unable to load')).toBeVisible(),
    );
    expect(screen.queryByText('Your list is empty.')).not.toBeOnTheScreen();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() =>
      expect(screen.getByText('Your list is empty.')).toBeVisible(),
    );
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
    const originalGetPage = dependencies.userListRepository.getPage.bind(
      dependencies.userListRepository,
    );
    let releaseNextPage: (() => void) | undefined;
    const getPage = jest
      .spyOn(dependencies.userListRepository, 'getPage')
      .mockImplementation(async (options) => {
        const page = await originalGetPage(options);
        if (options.page === 1) return page;
        await new Promise<void>((resolve) => {
          releaseNextPage = resolve;
        });
        return page;
      });
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

    await act(async () => releaseNextPage?.());
    await waitFor(() => expect(getLoadedPages(queryClient)).toHaveLength(2), {
      timeout: 2_000,
    });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    unmount();
  });
});
