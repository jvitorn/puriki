import { getSearchColumnCount } from '@/presentation/utils/responsive-grid';

describe('getSearchColumnCount', () => {
  it.each([
    [390, 2],
    [700, 3],
    [1024, 4],
    [1440, 5],
  ])('uses %i pixels for a %i-column grid', (width, expected) => {
    expect(getSearchColumnCount(width)).toBe(expected);
  });
});
