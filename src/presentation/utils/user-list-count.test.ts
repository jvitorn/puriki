import { formatUserListCount } from '@/presentation/utils/user-list-count';

describe('formatUserListCount', () => {
  it('uses an exact repository total when available', () => {
    expect(
      formatUserListCount({
        filterLabel: 'All',
        hasNextPage: true,
        loadedCount: 25,
        totalCount: 250,
      }),
    ).toBe('250 anime • All');
  });

  it('does not imply a final total when more unknown-count pages exist', () => {
    expect(
      formatUserListCount({
        filterLabel: 'Watching',
        hasNextPage: true,
        loadedCount: 25,
        totalCount: null,
      }),
    ).toBe('25+ anime • Watching');
  });

  it('uses the loaded count when the final page is known', () => {
    expect(
      formatUserListCount({
        filterLabel: 'Completed',
        hasNextPage: false,
        loadedCount: 42,
        totalCount: null,
      }),
    ).toBe('42 anime • Completed');
  });
});
