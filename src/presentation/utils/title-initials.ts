export function getTitleInitials(title: string, maxLength = 3): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, maxLength)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
