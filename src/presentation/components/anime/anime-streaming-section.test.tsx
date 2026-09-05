import { screen } from '@testing-library/react-native';

import type { AnimeStreamingService } from '@/domain/models/anime';
import { AnimeStreamingSection } from '@/presentation/components/anime/anime-streaming-section';
import { renderWithProviders } from '@/tests/render/test-render';

function service(name: string): AnimeStreamingService {
  return { name, iconUrl: null };
}

function cardFor(name: string) {
  return screen.getByLabelText(`Available on ${name}`);
}

describe('AnimeStreamingSection', () => {
  it('renders nothing when there are no services', async () => {
    await renderWithProviders(<AnimeStreamingSection services={[]} />);
    expect(screen.queryByText('Where to watch')).not.toBeOnTheScreen();
  });

  it('keeps a single service on a full-width row', async () => {
    await renderWithProviders(
      <AnimeStreamingSection services={[service('Crunchyroll')]} />,
    );
    expect(cardFor('Crunchyroll')).toBeVisible();
  });

  it('places two services on the same row', async () => {
    await renderWithProviders(
      <AnimeStreamingSection
        services={[service('Crunchyroll'), service('Hulu')]}
      />,
    );
    expect(cardFor('Crunchyroll').parent).toBe(cardFor('Hulu').parent);
  });

  it('keeps an odd third service alone in the first column of its own row', async () => {
    await renderWithProviders(
      <AnimeStreamingSection
        services={[service('Crunchyroll'), service('Hulu'), service('Netflix')]}
      />,
    );
    expect(cardFor('Crunchyroll').parent).toBe(cardFor('Hulu').parent);
    expect(cardFor('Netflix').parent).not.toBe(cardFor('Crunchyroll').parent);
    expect(cardFor('Netflix').parent?.children).toHaveLength(2);
  });

  it('lays out four services as two full rows of two', async () => {
    await renderWithProviders(
      <AnimeStreamingSection
        services={[
          service('Crunchyroll'),
          service('Hulu'),
          service('Adult Swim'),
          service('iQIYI'),
        ]}
      />,
    );
    expect(cardFor('Crunchyroll').parent).toBe(cardFor('Hulu').parent);
    expect(cardFor('Adult Swim').parent).toBe(cardFor('iQIYI').parent);
    expect(cardFor('Crunchyroll').parent).not.toBe(
      cardFor('Adult Swim').parent,
    );
  });

  it('keeps a trailing fifth service alone in the first column', async () => {
    await renderWithProviders(
      <AnimeStreamingSection
        services={[
          service('Crunchyroll'),
          service('Hulu'),
          service('Adult Swim'),
          service('iQIYI'),
          service('Netflix'),
        ]}
      />,
    );
    expect(cardFor('Crunchyroll').parent).toBe(cardFor('Hulu').parent);
    expect(cardFor('Adult Swim').parent).toBe(cardFor('iQIYI').parent);
    expect(cardFor('Netflix').parent?.children).toHaveLength(2);
    expect(cardFor('Netflix').parent).not.toBe(cardFor('iQIYI').parent);
  });
});
