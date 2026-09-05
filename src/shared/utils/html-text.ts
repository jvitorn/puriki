const BR_TAG_PATTERN = /\s*<br\s*\/?>\s*/gi;
const ESCAPED_BR_TAG_PATTERN = /\s*&lt;br\s*\/?&gt;\s*/gi;

export function normalizeHtmlLineBreaks<T extends string | null | undefined>(
  value: T,
): T {
  if (typeof value !== 'string') return value;
  return value
    .replace(BR_TAG_PATTERN, '\n')
    .replace(ESCAPED_BR_TAG_PATTERN, '\n') as T;
}
