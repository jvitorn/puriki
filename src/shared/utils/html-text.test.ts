import { normalizeHtmlLineBreaks } from '@/shared/utils/html-text';

describe('normalizeHtmlLineBreaks', () => {
  it('converts a single <br> into a line break', () => {
    expect(normalizeHtmlLineBreaks('foo<br>bar')).toBe('foo\nbar');
  });

  it('converts a self-closing <br/> into a line break', () => {
    expect(normalizeHtmlLineBreaks('foo<br/>bar')).toBe('foo\nbar');
  });

  it('converts a spaced self-closing <br /> into a line break', () => {
    expect(normalizeHtmlLineBreaks('foo<br />bar')).toBe('foo\nbar');
  });

  it('converts consecutive <br> tags into a blank line', () => {
    expect(normalizeHtmlLineBreaks('foo<br><br>bar')).toBe('foo\n\nbar');
  });

  it('collapses whitespace between two <br /> tags into a single blank line', () => {
    expect(normalizeHtmlLineBreaks('foo<br /> <br />bar')).toBe('foo\n\nbar');
  });

  it('is case-insensitive', () => {
    expect(normalizeHtmlLineBreaks('foo<BR>bar')).toBe('foo\nbar');
  });

  it('leaves plain text without markup untouched', () => {
    expect(normalizeHtmlLineBreaks('It was a dark and stormy night.')).toBe(
      'It was a dark and stormy night.',
    );
  });

  it('preserves normal text such as a source attribution', () => {
    expect(
      normalizeHtmlLineBreaks(
        "It's been years since...<br><br>(Source: Crunchyroll)",
      ),
    ).toBe("It's been years since...\n\n(Source: Crunchyroll)");
  });

  it('returns an empty string unchanged', () => {
    expect(normalizeHtmlLineBreaks('')).toBe('');
  });

  it('returns null and undefined unchanged', () => {
    expect(normalizeHtmlLineBreaks(null)).toBeNull();
    expect(normalizeHtmlLineBreaks(undefined)).toBeUndefined();
  });
});
