import type { TFunction } from 'i18next';

export function formatUserListCount({
  filterLabel,
  hasNextPage,
  loadedCount,
  totalCount,
  t,
}: {
  filterLabel: string;
  hasNextPage: boolean | undefined;
  loadedCount: number;
  totalCount: number | null | undefined;
  t: TFunction;
}): string {
  if (totalCount === null || totalCount === undefined) {
    return hasNextPage === true
      ? t('myList.loadedCount', { count: loadedCount, filter: filterLabel })
      : t('myList.count', { count: loadedCount, filter: filterLabel });
  }
  return t('myList.count', { count: totalCount, filter: filterLabel });
}
