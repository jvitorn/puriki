export function formatUserListCount({
  filterLabel,
  hasNextPage,
  loadedCount,
  totalCount,
}: {
  filterLabel: string;
  hasNextPage: boolean | undefined;
  loadedCount: number;
  totalCount: number | null | undefined;
}): string {
  const count =
    totalCount ?? (hasNextPage === true ? `${loadedCount}+` : loadedCount);
  return `${count} anime • ${filterLabel}`;
}
