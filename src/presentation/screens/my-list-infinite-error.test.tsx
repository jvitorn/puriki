import type { InfiniteData } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { UnifiedAnime } from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import { queryKeys } from '@/presentation/queries/query-keys';
import { MyListScreen } from '@/presentation/screens/my-list-screen';
import { buildUserListDataset } from '@/tests/fixtures/anime-dataset';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

describe('MyListScreen next-page recovery', () => {
  it('keeps loaded rows visible when the next page fails and retries it', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 53 }),
    );
    const originalGetPage = dependencies.userListRepository.getPage.bind(
      dependencies.userListRepository,
    );
    let failPageTwo = true;
    dependencies.userListRepository.getPage = jest.fn(async (request) => {
      if (request.page === 2 && failPageTwo) {
        throw new Error('Page 2 failed');
      }
      return originalGetPage(request);
    });
    const { queryClient } = await renderWithProviders(<MyListScreen />, {
      dependencies,
    });
    await waitFor(() => expect(screen.getByTestId('my-list')).toBeVisible());

    fireEvent(screen.getByTestId('my-list'), 'onEndReached');
    await waitFor(() =>
      expect(screen.getByText("Couldn't load more anime.")).toBeVisible(),
    );
    expect(screen.getByText('Generated Anime 1')).toBeVisible();

    failPageTwo = false;
    fireEvent.press(screen.getByLabelText('Retry loading more anime'));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<
          InfiniteData<PageResult<UnifiedAnime>, number>
        >(queryKeys.infiniteUserList('guest'))?.pages,
      ).toHaveLength(2),
    );
    expect(
      screen.queryByText("Couldn't load more anime."),
    ).not.toBeOnTheScreen();
  });
});
