const BR_TAG_PATTERN = /\s*<br\s*\/?>\s*/gi;

export function normalizeHtmlLineBreaks<T extends string | null | undefined>(
  value: T,
): T {
  if (typeof value !== 'string') return value;
  return value.replace(BR_TAG_PATTERN, '\n') as T;
}
