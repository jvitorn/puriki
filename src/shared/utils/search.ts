export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase();
}

export function includesNormalized(haystack: string, needle: string): boolean {
  return normalizeSearchText(haystack).includes(normalizeSearchText(needle));
}
